import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

function describe(item) {
  const name = item.entity_name ? `"${item.entity_name}"` : "";
  const meta = item.meta || {};
  switch (item.action) {
    case "project_created":
      return `created project ${name}`;
    case "project_deleted":
      return `deleted project ${name}`;
    case "task_created":
      return `added ${name}${meta.project ? ` to ${meta.project}` : ""}`;
    case "task_moved":
      return `moved ${name} to ${STATUS_LABELS[meta.status] || meta.status}`;
    case "task_completed":
      return `completed ${name}`;
    case "member_joined":
      return "joined the workspace";
    default:
      return item.action;
  }
}

function projectStatus(project) {
  if (project.total_tasks === 0) return { label: "No tasks", tone: "gray" };
  if (project.done_tasks === project.total_tasks) return { label: "Done", tone: "green" };
  if (project.overdue_tasks > 0) return { label: "At risk", tone: "red" };
  return { label: "In progress", tone: "blue" };
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="muted">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="muted">{hint}</span>
    </div>
  );
}

export default function Overview() {
  const { workspaceId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = session.token;
    Promise.all([
      api(`/api/workspaces/${workspaceId}/overview`, { token }),
      api(`/api/workspaces/${workspaceId}/activity?limit=8`, { token }),
    ])
      .then(([overview, feed]) => {
        setData(overview);
        setActivity(feed.activity);
      })
      .catch((err) => setError(err.message));
  }, [workspaceId, session.token]);

  const firstName = session.user.fullName.split(" ")[0];

  return (
    <div>
      <h1>
        {greeting()}, {firstName}
      </h1>
      <p className="muted">Here's what's happening across your workspace today.</p>

      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Loading...</p>}

      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Projects" value={data.stats.projects} hint="in this workspace" />
            <StatCard
              label="Tasks completed"
              value={data.stats.done_tasks}
              hint={`of ${data.stats.total_tasks} tasks`}
            />
            <StatCard
              label="Overdue tasks"
              value={data.stats.overdue_tasks}
              hint={`${data.stats.in_progress_tasks} in progress`}
            />
            <StatCard label="Team members" value={data.stats.members} hint="with access" />
          </div>

          <div className="overview-grid">
            <section>
              <div className="section-head">
                <h2>Projects</h2>
                <Link to={`/workspaces/${workspaceId}/projects`}>View all projects</Link>
              </div>

              {data.projects.length === 0 && (
                <p className="muted">
                  No projects yet. Create your first one from the Projects page.
                </p>
              )}

              <div className="project-list">
                {data.projects.map((p) => {
                  const status = projectStatus(p);
                  const percent = p.total_tasks
                    ? Math.round((p.done_tasks / p.total_tasks) * 100)
                    : 0;

                  return (
                    <Link
                      key={p.id}
                      className="project-row"
                      to={`/workspaces/${workspaceId}/projects/${p.id}`}
                    >
                      <div className="project-main">
                        <strong>{p.name}</strong>
                        <span className="muted">
                          {p.done_tasks} / {p.total_tasks} tasks
                        </span>
                      </div>
                      <div className="progress">
                        <div className="progress-bar" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="percent">{percent}%</span>
                      <span className={`tag ${status.tone}`}>{status.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="section-head">
                <h2>Recent activity</h2>
              </div>

              <div className="activity-card">
                {activity.length === 0 && (
                  <p className="muted">
                    Nothing yet. Create a project or move a task and it will show up here.
                  </p>
                )}

                {activity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div className="avatar small-avatar">{initials(item.full_name)}</div>
                    <div className="activity-text">
                      <span>
                        <strong>{item.full_name || "Someone"}</strong> {describe(item)}
                      </span>
                      <span className="muted">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}