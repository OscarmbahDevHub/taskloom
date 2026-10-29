const express = require("express");
const pool = require("../db");
const stripe = require("../stripe");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT status, current_period_end FROM subscriptions WHERE workspace_id = $1",
      [req.workspace.id]
    );
    res.json({
      plan: req.workspace.plan,
      subscription: result.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load billing info" });
  }
});

router.post("/checkout", requireRole("admin"), async (req, res) => {
  if (req.workspace.plan === "pro") {
    return res.status(400).json({ error: "This workspace is already on the Pro plan" });
  }

  try {
    const existing = await pool.query(
      "SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = $1",
      [req.workspace.id]
    );

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      ...(existing.rows[0]
        ? { customer: existing.rows[0].stripe_customer_id }
        : { customer_email: req.user.email }),
      client_reference_id: req.workspace.id,
      subscription_data: { metadata: { workspaceId: req.workspace.id } },
      success_url: `${clientUrl}/billing/success`,
      cancel_url: `${clientUrl}/billing/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start checkout" });
  }
});

module.exports = router;