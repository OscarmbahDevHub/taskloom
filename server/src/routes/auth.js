const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", async (req, res) => {
  const { fullName, email, password, workspaceName } = req.body;

  if (!fullName || !email || !password || !workspaceName) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const cleanEmail = email.trim().toLowerCase();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name",
      [cleanEmail, passwordHash, fullName.trim()]
    );
    const user = userResult.rows[0];

    const workspaceResult = await client.query(
      "INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id, name, plan",
      [workspaceName.trim(), user.id]
    );
    const workspace = workspaceResult.rows[0];

    await client.query(
      "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
      [workspace.id, user.id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      token: signToken(user),
      user: { id: user.id, email: user.email, fullName: user.full_name },
      workspace,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, full_name, password_hash FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const workspaces = await pool.query(
      `SELECT w.id, w.name, w.plan, m.role
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1`,
      [user.id]
    );

    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, fullName: user.full_name },
      workspaces: workspaces.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, full_name FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const workspaces = await pool.query(
      `SELECT w.id, w.name, w.plan, m.role
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1`,
      [user.id]
    );

    res.json({
      user: { id: user.id, email: user.email, fullName: user.full_name },
      workspaces: workspaces.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profile" });
  }
});

module.exports = router;