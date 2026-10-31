const express = require("express");
const pool = require("../db");
const PLANS = require("../config/plans");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");
const { logActivity } = require("../activity");

const router = express.Router({ mergeParams: true });

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.created_by, p.created_at,
         p.client_id, p.value_cents, c.name AS client_name
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id`;

function toCents(value) {
  if (value === undefined || value === null || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) return null;
  return Math.round(number * 100);
}

async function clientInWorkspace(workspaceId, clientId) {
  if (!UUID_REGEX.test(clientId)) return false;
  const result = await pool.query(
    "SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2",
    [clientId, workspaceId]
  );
  return result.rows.length > 0;
}

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `${PROJECT_SELECT}
       WHERE p.workspace_id = $1
       ORDER BY p.created_at DESC`,
      [req.workspace.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load projects" });
  }
});

router.post("/", requireRole("admin", "member"), async (req, res) => {
  const { name, description, clientId, value } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const cents = toCents(value);
  if (cents === null) {
    return res.status(400).json({ error: "Value must be a number between 0 and 1,000,000" });
  }

  try {
    if (clientId && !(await clientInWorkspace(req.workspace.id, clientId))) {
      return res.status(400).json({ error: "Client not found in this workspace" });
    }

    const count = await pool.query(
      "SELECT COUNT(*)::int AS total FROM projects WHERE workspace_id = $1",
      [req.workspace.id]
    );

    const limit = PLANS[req.workspace.plan].maxProjects;
    if (count.rows[0].total >= limit) {
      return res.status(403).json({
        error: `Your ${req.workspace.plan} plan allows up to ${limit} projects. Upgrade to add more.`,
      });
    }

    const inserted = await pool.query(
      `INSERT INTO projects (workspace_id, name, description, created_by, client_id, value_cents)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.workspace.id,
        name.trim(),
        description || null,
        req.user.id,
        clientId || null,
        cents,
      ]
    );

    const result = await pool.query(`${PROJECT_SELECT} WHERE p.id = $1`, [
      inserted.rows[0].id,
    ]);
    const project = result.rows[0];

    await logActivity({
      workspaceId: req.workspace.id,
      userId: req.user.id,
      action: "project_created",
      entityName: project.name,
    });

    res.status(201).json({ project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create project" });
  }
});

router.patch("/:projectId", requireRole("admin", "member"), async (req, res) => {
  const { projectId } = req.params;

  if (!UUID_REGEX.test(projectId)) {
    return res.status(400).json({ error: "Invalid project id" });
  }

  const sets = [];
  const values = [];

  try {
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) {
        return res.status(400).json({ error: "Project name cannot be empty" });
      }
      values.push(String(req.body.name).trim());
      sets.push(`name = $${values.length}`);
    }

    if (req.body.value !== undefined) {
      const cents = toCents(req.body.value);
      if (cents === null) {
        return res.status(400).json({ error: "Value must be a number between 0 and 1,000,000" });
      }
      values.push(cents);
      sets.push(`value_cents = $${values.length}`);
    }

    if (req.body.clientId !== undefined) {
      const clientId = req.body.clientId || null;
      if (clientId && !(await clientInWorkspace(req.workspace.id, clientId))) {
        return res.status(400).json({ error: "Client not found in this workspace" });
      }
      values.push(clientId);
      sets.push(`client_id = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    values.push(projectId, req.workspace.id);
    const updated = await pool.query(
      `UPDATE projects SET ${sets.join(", ")}
       WHERE id = $${values.length - 1} AND workspace_id = $${values.length}
       RETURNING id`,
      values
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const result = await pool.query(`${PROJECT_SELECT} WHERE p.id = $1`, [projectId]);
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update project" });
  }
});

router.delete("/:projectId", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM projects WHERE id = $1 AND workspace_id = $2 RETURNING id, name",
      [req.params.projectId, req.workspace.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    await logActivity({
      workspaceId: req.workspace.id,
      userId: req.user.id,
      action: "project_deleted",
      entityName: result.rows[0].name,
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete project" });
  }
});

module.exports = router;