const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  const { month } = req.query;

  if (!month || !MONTH_REGEX.test(month)) {
    return res.status(400).json({ error: "month must look like 2026-10" });
  }

  const start = `${month}-01`;

  try {
    const tasks = await pool.query(
      `SELECT t.id, t.title, t.status,
              to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
              t.project_id, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.workspace_id = $1
         AND t.due_date >= $2::date
         AND t.due_date < ($2::date + interval '1 month')
       ORDER BY t.due_date, t.created_at`,
      [req.workspace.id, start]
    );

    const undated = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM tasks
       WHERE workspace_id = $1 AND due_date IS NULL AND status <> 'done'`,
      [req.workspace.id]
    );

    res.json({
      month,
      tasks: tasks.rows,
      undated: undated.rows[0].total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load calendar" });
  }
});

module.exports = router;