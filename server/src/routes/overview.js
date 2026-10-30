const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  const workspaceId = req.workspace.id;

  try {
    const stats = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM projects WHERE workspace_id = $1) AS projects,
         (SELECT COUNT(*)::int FROM memberships WHERE workspace_id = $1) AS members,
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_tasks,
         COUNT(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue_tasks
       FROM tasks
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const projects = await pool.query(
      `SELECT p.id, p.name, p.description, p.created_at,
              COUNT(t.id)::int AS total_tasks,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
              COUNT(t.id) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)::int AS overdue_tasks
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [workspaceId]
    );

    res.json({
      plan: req.workspace.plan,
      stats: stats.rows[0],
      projects: projects.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load overview" });
  }
});

module.exports = router;