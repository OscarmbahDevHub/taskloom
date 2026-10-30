const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  try {
    const result = await pool.query(
      `SELECT a.id, a.action, a.entity_name, a.meta, a.created_at, u.full_name
       FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.workspace_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [req.workspace.id, limit]
    );
    res.json({ activity: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load activity" });
  }
});

module.exports = router;