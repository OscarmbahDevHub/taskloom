const express = require("express");
const pool = require("../db");
const PLANS = require("../config/plans");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["todo", "in_progress", "done"];
const ACTIONS = ["notify_admins", "assign_to"];

const automationsRouter = express.Router({ mergeParams: true });
automationsRouter.use(requireAuth, requireWorkspace);

automationsRouter.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.trigger_status, a.action, a.action_user_id,
              u.full_name AS action_user_name,
              a.active, a.run_count, a.last_run_at, a.created_at
       FROM automations a
       LEFT JOIN users u ON u.id = a.action_user_id
       WHERE a.workspace_id = $1
       ORDER BY a.created_at DESC`,
      [req.workspace.id]
    );
    res.json({ automations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load automations" });
  }
});

automationsRouter.post("/", requireRole("admin"), async (req, res) => {
  const { name, triggerStatus, action, actionUserId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Automation name is required" });
  }
  if (!STATUSES.includes(triggerStatus)) {
    return res.status(400).json({ error: "Invalid trigger status" });
  }
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    if (action === "assign_to") {
      if (!actionUserId || !UUID_REGEX.test(actionUserId)) {
        return res.status(400).json({ error: "Choose who the task should be assigned to" });
      }
      const member = await pool.query(
        "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
        [req.workspace.id, actionUserId]
      );
      if (member.rows.length === 0) {
        return res.status(400).json({ error: "That person is not a member of this workspace" });
      }
    }

    const count = await pool.query(
      "SELECT COUNT(*)::int AS total FROM automations WHERE workspace_id = $1",
      [req.workspace.id]
    );
    const limit = PLANS[req.workspace.plan].maxAutomations;
    if (count.rows[0].total >= limit) {
      return res.status(403).json({
        error: `Your ${req.workspace.plan} plan allows up to ${limit} automations. Upgrade to add more.`,
      });
    }

    const result = await pool.query(
      `INSERT INTO automations (workspace_id, name, trigger_status, action, action_user_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, trigger_status, action, action_user_id, active, run_count, created_at`,
      [
        req.workspace.id,
        name.trim(),
        triggerStatus,
        action,
        action === "assign_to" ? actionUserId : null,
        req.user.id,
      ]
    );

    res.status(201).json({ automation: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create automation" });
  }
});

automationsRouter.patch("/:automationId", requireRole("admin"), async (req, res) => {
  const { automationId } = req.params;

  if (!UUID_REGEX.test(automationId)) {
    return res.status(400).json({ error: "Invalid automation id" });
  }
  if (typeof req.body.active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false" });
  }

  try {
    const result = await pool.query(
      `UPDATE automations SET active = $1
       WHERE id = $2 AND workspace_id = $3
       RETURNING id, active`,
      [req.body.active, automationId, req.workspace.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Automation not found" });
    }

    res.json({ automation: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update automation" });
  }
});

automationsRouter.delete("/:automationId", requireRole("admin"), async (req, res) => {
  const { automationId } = req.params;

  if (!UUID_REGEX.test(automationId)) {
    return res.status(400).json({ error: "Invalid automation id" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM automations WHERE id = $1 AND workspace_id = $2 RETURNING id",
      [automationId, req.workspace.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Automation not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete automation" });
  }
});

const notificationsRouter = express.Router({ mergeParams: true });
notificationsRouter.use(requireAuth, requireWorkspace);

notificationsRouter.get("/", async (req, res) => {
  try {
    const list = await pool.query(
      `SELECT id, message, link, read_at, created_at
       FROM notifications
       WHERE user_id = $1 AND workspace_id = $2
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id, req.workspace.id]
    );

    const unread = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL`,
      [req.user.id, req.workspace.id]
    );

    res.json({ notifications: list.rows, unreadCount: unread.rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load notifications" });
  }
});

notificationsRouter.post("/read-all", async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL`,
      [req.user.id, req.workspace.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update notifications" });
  }
});

module.exports = { automationsRouter, notificationsRouter };