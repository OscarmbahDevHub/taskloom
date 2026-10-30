import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export default function ProjectBoard() {
  const { workspaceId, projectId } = useParams();
  const { session, logout } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const role = workspace ? workspace.role : null;
  const canEdit = role === "admin" || role === "member";

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const base = `/api/workspaces/${workspaceId}/projects`;

  const load = useCallback(async () => {
    const [projectData, taskData] = await Promise.all([
      api(base, { token }),
      api(`${base}/${projectId}/tasks`, { token }),
    ]);
    setProject(projectData.projects.find((p) => p.id === projectId) || null);
    setTasks(taskData.tasks);
  }, [base, projectId, token]);

  useEffect(() => {
    if (!workspace) return;
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspace, load]);

  async function createTask(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api(`${base}/${projectId}/tasks`, {
        method: "POST",
        token,
        body: { title, dueDate: dueDate || undefined },
      });
      setTasks([data.task, ...tasks]);
      setTitle("");
      setDueDate("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(task, status) {
    setError("");
    try {
      const data = await api(`${base}/${projectId}/tasks/${task.id}`, {
        method: "PATCH",
        token,
        body: { status },
      });
      setTasks(tasks.map((t) => (t.id === task.id ? data.task : t)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm("Delete this task?")) return;
    setError("");
    try {
      await api(`${base}/${projectId}/tasks/${task.id}`, {
        method: "DELETE",
        token,
      });
      setTasks(tasks.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!workspace) {
    return (
      <div className="page">
        <main className="content">
          <h1>Workspace not found</h1>
          <Link to="/">Back to dashboard</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/">
          <strong>Taskloom</strong>
        </Link>
        <div className="topbar-right">
          <span className="muted">{session.user.fullName}</span>
          <button className="secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content wide">
        <p className="muted">
          <Link to={`/workspaces/${workspaceId}`}>← {workspace.name}</Link>
        </p>
        <h1>{project ? project.name : loading ? "Loading..." : "Project not found"}</h1>

        {error && <div className="error">{error}</div>}

        {canEdit && (
          <form className="inline-form" onSubmit={createTask}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task"
              required
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              Add task
            </button>
          </form>
        )}

        <div className="board">
          {COLUMNS.map((col) => {
            const columnTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div className="column" key={col.key}>
                <h2>
                  {col.label} <span className="muted">({columnTasks.length})</span>
                </h2>

                {columnTasks.length === 0 && <p className="muted">Nothing here.</p>}

                {columnTasks.map((task) => (
                  <div className="task-card" key={task.id}>
                    <strong>{task.title}</strong>
                    {task.due_date && <span className="muted">Due {task.due_date}</span>}

                    {canEdit && (
                      <div className="task-actions">
                        {COLUMNS.filter((c) => c.key !== task.status).map((c) => (
                          <button
                            key={c.key}
                            className="secondary small"
                            onClick={() => moveTask(task, c.key)}
                          >
                            {c.label}
                          </button>
                        ))}
                        <button
                          className="secondary small"
                          onClick={() => deleteTask(task)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}