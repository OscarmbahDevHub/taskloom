const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");

const router = express.Router({ mergeParams: true });

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.company, c.created_at,
              COUNT(p.id)::int AS project_count,
              COALESCE(SUM(p.value_cents), 0)::float8 AS total_value_cents
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id
       WHERE c.workspace_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.workspace.id]
    );
    res.json({ clients: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load clients" });
  }
});

router.post("/", requireRole("admin", "member"), async (req, res) => {
  const { name, email, company } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Client name is required" });
  }
  if (email && !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "Client email is not valid" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clients (workspace_id, name, email, company)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, company, created_at`,
      [
        req.workspace.id,
        name.trim(),
        email ? email.trim().toLowerCase() : null,
        company ? company.trim() : null,
      ]
    );
    res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create client" });
  }
});

router.delete("/:clientId", requireRole("admin"), async (req, res) => {
  const { clientId } = req.params;

  if (!UUID_REGEX.test(clientId)) {
    return res.status(400).json({ error: "Invalid client id" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM clients WHERE id = $1 AND workspace_id = $2 RETURNING id",
      [clientId, req.workspace.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete client" });
  }
});

module.exports = router;