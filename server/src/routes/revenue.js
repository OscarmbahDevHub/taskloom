const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

router.get("/", async (req, res) => {
  const workspaceId = req.workspace.id;

  try {
    const finished = await pool.query(
      `SELECT p.id, p.value_cents, MAX(t.completed_at) AS finished_at
       FROM projects p
       JOIN tasks t ON t.project_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id
       HAVING COUNT(*) = COUNT(*) FILTER (WHERE t.status = 'done')
          AND MAX(t.completed_at) IS NOT NULL`,
      [workspaceId]
    );

    const all = await pool.query(
      `SELECT COALESCE(SUM(value_cents), 0)::float8 AS total_cents
       FROM projects WHERE workspace_id = $1`,
      [workspaceId]
    );

    const now = new Date();
    const keys = [];
    for (let i = 5; i >= 0; i -= 1) {
      keys.push(
        monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))
      );
    }

    const totals = Object.fromEntries(keys.map((key) => [key, 0]));
    let earnedCents = 0;

    for (const row of finished.rows) {
      earnedCents += row.value_cents;
      const key = monthKey(new Date(row.finished_at));
      if (key in totals) totals[key] += row.value_cents;
    }

    const months = keys.map((key) => ({ month: key, revenueCents: totals[key] }));
    const thisMonthCents = months[5].revenueCents;
    const lastMonthCents = months[4].revenueCents;

    res.json({
      currency: "USD",
      thisMonthCents,
      lastMonthCents,
      changePercent: lastMonthCents
        ? Math.round(((thisMonthCents - lastMonthCents) / lastMonthCents) * 100)
        : null,
      earnedCents,
      pipelineCents: all.rows[0].total_cents - earnedCents,
      months,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load revenue" });
  }
});

module.exports = router;