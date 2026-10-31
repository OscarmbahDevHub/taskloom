const pool = require("./db");
const { logActivity } = require("./activity");

const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

async function runAutomations({ workspaceId, task, status, actorId, projectName, projectId }) {
  try {
    const rules = await pool.query(
      `SELECT id, name, action, action_user_id
       FROM automations
       WHERE workspace_id = $1 AND active = true AND trigger_status = $2
       ORDER BY created_at`,
      [workspaceId, status]
    );

    for (const rule of rules.rows) {
      try {
        if (rule.action === "notify_admins") {
          const message = `"${task.title}" moved to ${STATUS_LABELS[status]} in ${projectName}`;
          const link = `/workspaces/${workspaceId}/projects/${projectId}`;

          await pool.query(
            `INSERT INTO notifications (workspace_id, user_id, message, link)
             SELECT $1::uuid, m.user_id, $2::text, $3::text
             FROM memberships m
             WHERE m.workspace_id = $1::uuid AND m.role = 'admin'`,
            [workspaceId, message, link]
          );
        } else if (rule.action === "assign_to") {
          if (!rule.action_user_id) continue;

          const member = await pool.query(
            "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
            [workspaceId, rule.action_user_id]
          );
          if (member.rows.length === 0) continue;

          await pool.query(
            "UPDATE tasks SET assignee_id = $1 WHERE id = $2 AND workspace_id = $3",
            [rule.action_user_id, task.id, workspaceId]
          );
        } else {
          continue;
        }

        await pool.query(
          "UPDATE automations SET run_count = run_count + 1, last_run_at = now() WHERE id = $1",
          [rule.id]
        );

        await logActivity({
          workspaceId,
          userId: actorId,
          action: "automation_ran",
          entityName: rule.name,
          meta: { task: task.title },
        });
      } catch (err) {
        console.error(`Automation "${rule.name}" failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("Could not run automations:", err.message);
  }
}

module.exports = { runAutomations };