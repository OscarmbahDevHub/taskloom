const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { requireWorkspace, requireRole } = require("../middleware/requireWorkspace");
const { logActivity } = require("../activity");

const router = express.Router({ mergeParams: true });

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["todo", "in_progress", "done"];
const TASK_COLUMNS =
  "id, title, description, status, assignee_id, due_date, completed_at, created_at";

router.use(requireAuth, requireWorkspace);

router.use(async (req, res, next) => {
  const { projectId } = req.params;

  if (!UUID_REGEX.test(projectId)) {
    return res.status(400).json({ error: "Invalid project id" });
  }

  try {
    const result = await pool.query(
      "SELECT id, name FROM projects WHERE id = $1 AND workspace_id = $2",
      [projectId, req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    req.project = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not verify project" });
  }
});

async function assigneeIsMember(workspaceId, userId) {
  const result = await pool.query(
    "SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  return result.rows.length > 0;
}

router.get("/", async (req, res) => {
  const { status } = req.query;

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status filter" });
  }

  try {
    const params = [req.workspace.id, req.params.projectId];
    let sql = `SELECT ${TASK_COLUMNS}
               FROM tasks
               WHERE workspace_id = $1 AND project_id = $2`;

    if (status) {
      params.push(status);
      sql += " AND status = $3";
    }
    sql += " ORDER BY created_at DESC";

    const result = await pool.query(sql, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load tasks" });
  }
});

router.post("/", requireRole("admin", "member"), async (req, res) => {
  const { title, description, status, assigneeId, dueDate } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Task title is required" });
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    if (assigneeId) {
      if (!UUID_REGEX.test(assigneeId) || !(await assigneeIsMember(req.workspace.id, assigneeId))) {
        return res.status(400).json({ error: "Assignee must be a member of this workspace" });
      }
    }

    const result = await pool.query(
      `INSERT INTO tasks (workspace_id, project_id, title, description, status, assignee_id, due_date, completed_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::text, 'todo'), $6, $7,
               CASE WHEN COALESCE($5::text, 'todo') = 'done' THEN now() ELSE NULL END)
       RETURNING ${TASK_COLUMNS}`,
      [
        req.workspace.id,
        req.params.projectId,
        title.trim(),
        description || null,
        status || null,
        assigneeId || null,
        dueDate || null,
      ]
    );

    const task = result.rows[0];

    await logActivity({
      workspaceId: req.workspace.id,
      userId: req.user.id,
      action: "task_created",
      entityName: task.title,
      meta: { project: req.project.name },
    });

    res.status(201).json({ task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create task" });
  }
});

router.patch("/:taskId", requireRole("admin", "member"), async (req, res) => {
  const { taskId } = req.params;

  if (!UUID_REGEX.test(taskId)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const fields = {
    title: req.body.title,
    description: req.body.description,
    status: req.body.status,
    assignee_id: req.body.assigneeId,
    due_date: req.body.dueDate,
  };

  if (fields.title !== undefined && !String(fields.title).trim()) {
    return res.status(400).json({ error: "Title cannot be empty" });
  }
  if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const existing = await pool.query(
      `SELECT status FROM tasks
       WHERE id = $1 AND workspace_id = $2 AND project_id = $3`,
      [taskId, req.workspace.id, req.params.projectId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    const previousStatus = existing.rows[0].status;

    if (fields.assignee_id) {
      if (
        !UUID_REGEX.test(fields.assignee_id) ||
        !(await assigneeIsMember(req.workspace.id, fields.assignee_id))
      ) {
        return res.status(400).json({ error: "Assignee must be a member of this workspace" });
      }
    }

    const sets = [];
    const values = [];
    for (const [column, value] of Object.entries(fields)) {
      if (value !== undefined) {
        values.push(column === "title" ? String(value).trim() : value);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const statusChanged =
      fields.status !== undefined && fields.status !== previousStatus;
    if (statusChanged) {
      sets.push(fields.status === "done" ? "completed_at = now()" : "completed_at = NULL");
    }

    values.push(taskId, req.workspace.id, req.params.projectId);
    const result = await pool.query(
      `UPDATE tasks SET ${sets.join(", ")}
       WHERE id = $${values.length - 2}
         AND workspace_id = $${values.length - 1}
         AND project_id = $${values.length}
       RETURNING ${TASK_COLUMNS}`,
      values
    );

    const task = result.rows[0];

    if (statusChanged) {
      await logActivity({
        workspaceId: req.workspace.id,
        userId: req.user.id,
        action: fields.status === "done" ? "task_completed" : "task_moved",
        entityName: task.title,
        meta: { project: req.project.name, status: fields.status },
      });
    }

    res.json({ task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update task" });
  }
});

router.delete("/:taskId", requireRole("admin", "member"), async (req, res) => {
  const { taskId } = req.params;

  if (!UUID_REGEX.test(taskId)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND workspace_id = $2 AND project_id = $3
       RETURNING id`,
      [taskId, req.workspace.id, req.params.projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete task" });
  }
});

module.exports = router;