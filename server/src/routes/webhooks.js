const pool = require("../db");
const stripe = require("../stripe");

async function applySubscription(subscription) {
  const workspaceId = subscription.metadata && subscription.metadata.workspaceId;
  if (!workspaceId) return;

  const isActive = ["active", "trialing"].includes(subscription.status);
  const item = subscription.items && subscription.items.data[0];
  const periodEndUnix =
    (item && item.current_period_end) || subscription.current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO subscriptions
         (workspace_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id) DO UPDATE SET
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end`,
      [workspaceId, customerId, subscription.id, subscription.status, periodEnd]
    );

    await client.query("UPDATE workspaces SET plan = $1 WHERE id = $2", [
      isActive ? "pro" : "free",
      workspaceId,
    ]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleWebhook(req, res) {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await applySubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook handling failed" });
  }
}

module.exports = { handleWebhook };