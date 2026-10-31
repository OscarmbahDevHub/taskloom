import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Layout() {
  const { workspaceId } = useParams();
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [plan, setPlan] = useState(null);
  const [unread, setUnread] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const token = session.token;

  useEffect(() => {
    if (!workspace) return;
    api(`/api/workspaces/${workspaceId}/billing`, { token })
      .then((data) => setPlan(data.plan))
      .catch(() => setPlan(null));
  }, [workspace, workspaceId, token]);

  useEffect(() => {
    if (!workspace) return;
    api(`/api/workspaces/${workspaceId}/notifications`, { token })
      .then((data) => setUnread(data.unreadCount))
      .catch(() => setUnread(0));
  }, [workspace, workspaceId, token, location.pathname, refreshKey]);

  useEffect(() => {
    const handler = () => setRefreshKey((n) => n + 1);
    window.addEventListener("taskloom:notifications", handler);
    return () => window.removeEventListener("taskloom:notifications", handler);
  }, []);

  if (!workspace) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Workspace not found</h1>
          <Link to="/">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const isAdmin = workspace.role === "admin";
  const base = `/workspaces/${workspaceId}`;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          Taskloom
        </Link>

        <select
          className="switcher"
          value={workspaceId}
          onChange={(e) => navigate(`/workspaces/${e.target.value}`)}
        >
          {session.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <nav className="nav">
          <NavLink to={base} end>
            Overview
          </NavLink>
          <NavLink to={`${base}/projects`}>Projects</NavLink>
          <NavLink to={`${base}/clients`}>Clients</NavLink>
          <NavLink to={`${base}/calendar`}>Calendar</NavLink>
          <NavLink to={`${base}/analytics`}>Analytics</NavLink>
          <NavLink to={`${base}/automations`}>Automations</NavLink>
          <NavLink to={`${base}/team`}>Team</NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-box">
            <strong>{workspace.name}</strong>
            <span className="muted">{plan === "pro" ? "Pro plan" : "Free plan"}</span>
            {plan === "free" && isAdmin && (
              <Link to={`${base}/projects`} className="plan-link">
                View plans
              </Link>
            )}
          </div>

          <div className="user-box">
            <div className="avatar">{initials(session.user.fullName)}</div>
            <div className="user-info">
              <strong>{session.user.fullName}</strong>
              <span className="muted">{workspace.role}</span>
            </div>
            <button className="secondary small" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-top">
          <div>
            <strong>{workspace.name}</strong>
          </div>
          <div className="shell-top-right">
            <Link to={`${base}/automations`} className="bell">
              Notifications
              {unread > 0 && <span className="count">{unread}</span>}
            </Link>
            {isAdmin && (
              <Link to={`${base}/team`} className="button-link">
                + Invite member
              </Link>
            )}
          </div>
        </header>

        <div className="shell-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}