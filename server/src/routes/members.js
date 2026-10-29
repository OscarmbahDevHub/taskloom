const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, m.role, m.joined_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY m.joined_at ASC`,
      [req.workspace.id]
    );
    res.json({ members: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load members" });
  }
});

module.exports = router;