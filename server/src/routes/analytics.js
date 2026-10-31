const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 7), 90);
  const workspaceId = req.workspace.id;

  try {
    const counts = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done,
         COUNT(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue
       FROM tasks
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const onTime = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE completed_at::date <= due_date)::int AS on_time
       FROM tasks
       WHERE workspace_id = $1
         AND status = 'done'
         AND due_date IS NOT NULL
         AND completed_at IS NOT NULL`,
      [workspaceId]
    );

    const timeline = await pool.query(
      `WITH days AS (
         SELECT d::date AS day
         FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, interval '1 day') AS d
       )
       SELECT
         to_char(days.day, 'YYYY-MM-DD') AS day,
         COUNT(t.id) FILTER (
           WHERE t.completed_at IS NOT NULL AND t.completed_at::date <= days.day
         )::int AS completed,
         COUNT(t.id) FILTER (
           WHERE t.created_at::date <= days.day
             AND (t.completed_at IS NULL OR t.completed_at::date > days.day)
         )::int AS active,
         COUNT(t.id) FILTER (
           WHERE t.created_at::date <= days.day
             AND (t.completed_at IS NULL OR t.completed_at::date > days.day)
             AND t.due_date < days.day
         )::int AS overdue
       FROM days
       LEFT JOIN tasks t ON t.workspace_id = $1
       GROUP BY days.day
       ORDER BY days.day`,
      [workspaceId, days]
    );

    const finished = onTime.rows[0];

    res.json({
      days,
      counts: counts.rows[0],
      productivity: {
        percent: finished.total
          ? Math.round((finished.on_time / finished.total) * 100)
          : null,
        onTime: finished.on_time,
        total: finished.total,
      },
      timeline: timeline.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load analytics" });
  }
});

module.exports = router;