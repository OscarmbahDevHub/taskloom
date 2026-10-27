const express = require("express");
const pool = require("../db");
const PLANS = require("../config/plans");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, created_by, created_at
       FROM projects
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [req.workspace.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load projects" });
  }
});

router.post("/", requireRole("admin", "member"), async (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Project name is required" });
  }

  try {
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

    const result = await pool.query(
      `INSERT INTO projects (workspace_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, created_by, created_at`,
      [req.workspace.id, name.trim(), description || null, req.user.id]
    );

    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create project" });
  }
});

router.delete("/:projectId", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM projects WHERE id = $1 AND workspace_id = $2 RETURNING id",
      [req.params.projectId, req.workspace.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete project" });
  }
});

module.exports = router;