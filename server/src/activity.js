const pool = require("./db");

async function logActivity({ workspaceId, userId, action, entityName = null, meta = {} }) {
  try {
    await pool.query(
      `INSERT INTO activity (workspace_id, user_id, action, entity_name, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, userId, action, entityName, JSON.stringify(meta)]
    );
  } catch (err) {
    console.error("Could not log activity:", err.message);
  }
}

module.exports = { logActivity };