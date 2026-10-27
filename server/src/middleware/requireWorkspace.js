const pool = require("../db");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireWorkspace(req, res, next) {
  const { workspaceId } = req.params;

  if (!UUID_REGEX.test(workspaceId)) {
    return res.status(400).json({ error: "Invalid workspace id" });
  }

  try {
    const result = await pool.query(
      `SELECT m.role, w.plan
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.workspace_id = $1 AND m.user_id = $2`,
      [workspaceId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this workspace" });
    }

    req.workspace = {
      id: workspaceId,
      role: result.rows[0].role,
      plan: result.rows[0].plan,
    };
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not verify workspace access" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.workspace.role)) {
      return res.status(403).json({ error: "You do not have permission to do that" });
    }
    next();
  };
}

module.exports = { requireWorkspace, requireRole };