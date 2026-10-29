const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const PLANS = require("../config/plans");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");

const ROLES = ["admin", "member", "viewer"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const workspaceRouter = express.Router({ mergeParams: true });
workspaceRouter.use(requireAuth, requireWorkspace, requireRole("admin"));

workspaceRouter.post("/", async (req, res) => {
  const { email, role } = req.body;

  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Role must be admin, member or viewer" });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const members = await pool.query(
      "SELECT COUNT(*)::int AS total FROM memberships WHERE workspace_id = $1",
      [req.workspace.id]
    );
    const limit = PLANS[req.workspace.plan].maxMembers;
    if (members.rows[0].total >= limit) {
      return res.status(403).json({
        error: `Your ${req.workspace.plan} plan allows up to ${limit} members. Upgrade to add more.`,
      });
    }

    const alreadyMember = await pool.query(
      `SELECT 1 FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1 AND u.email = $2`,
      [req.workspace.id, cleanEmail]
    );
    if (alreadyMember.rows.length > 0) {
      return res.status(409).json({ error: "That person is already a member" });
    }

    const pending = await pool.query(
      `SELECT 1 FROM invitations
       WHERE workspace_id = $1 AND email = $2
         AND accepted_at IS NULL AND expires_at > now()`,
      [req.workspace.id, cleanEmail]
    );
    if (pending.rows.length > 0) {
      return res.status(409).json({ error: "A pending invitation already exists for that email" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const result = await pool.query(
      `INSERT INTO invitations (workspace_id, email, role, token, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days')
       RETURNING id, email, role, expires_at`,
      [req.workspace.id, cleanEmail, role, token]
    );

    res.status(201).json({ invitation: { ...result.rows[0], token } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create invitation" });
  }
});

workspaceRouter.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, expires_at
       FROM invitations
       WHERE workspace_id = $1 AND accepted_at IS NULL AND expires_at > now()
       ORDER BY expires_at DESC`,
      [req.workspace.id]
    );
    res.json({ invitations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load invitations" });
  }
});

const acceptRouter = express.Router();

acceptRouter.post("/accept", requireAuth, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Invitation token is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at,
              w.name AS workspace_name, w.plan
       FROM invitations i
       JOIN workspaces w ON w.id = i.workspace_id
       WHERE i.token = $1
       FOR UPDATE OF i`,
      [token]
    );
    const invite = found.rows[0];

    if (!invite) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invitation not found" });
    }
    if (invite.accepted_at) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Invitation was already used" });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Invitation has expired" });
    }
    if (invite.email !== req.user.email.toLowerCase()) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "This invitation was sent to a different email" });
    }

    const members = await client.query(
      "SELECT COUNT(*)::int AS total FROM memberships WHERE workspace_id = $1",
      [invite.workspace_id]
    );
    if (members.rows[0].total >= PLANS[invite.plan].maxMembers) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "This workspace has reached its member limit" });
    }

    await client.query(
      `INSERT INTO memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [invite.workspace_id, req.user.id, invite.role]
    );

    await client.query(
      "UPDATE invitations SET accepted_at = now() WHERE id = $1",
      [invite.id]
    );

    await client.query("COMMIT");

    res.json({
      joined: true,
      workspace: { id: invite.workspace_id, name: invite.workspace_name, role: invite.role },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not accept invitation" });
  } finally {
    client.release();
  }
});

module.exports = { workspaceRouter, acceptRouter };