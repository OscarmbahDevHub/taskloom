import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const FREE_LIMIT = 3;

export default function Workspace() {
  const { workspaceId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, logout } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);

  const [plan, setPlan] = useState(workspace ? workspace.plan : "free");
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => {
    const status = searchParams.get("billing");
    if (status === "success") return "Payment received. Activating your Pro plan...";
    if (status === "cancel") return "Checkout cancelled. You're still on the Free plan.";
    return "";
  });

  const base = `/api/workspaces/${workspaceId}`;
  const role = workspace ? workspace.role : null;
  const canEdit = role === "admin" || role === "member";
  const isAdmin = role === "admin";

  const loadProjects = useCallback(async () => {
    const data = await api(`${base}/projects`, { token });
    setProjects(data.projects);
  }, [base, token]);

  const loadBilling = useCallback(async () => {
    const data = await api(`${base}/billing`, { token });
    setPlan(data.plan);
    return data.plan;
  }, [base, token]);

  useEffect(() => {
    if (!workspace) return;
    Promise.all([loadProjects(), loadBilling()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspace, loadProjects, loadBilling]);

  useEffect(() => {
    if (searchParams.get("billing") !== "success") return;

    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const current = await loadBilling();
        if (current === "pro") {
          setNotice("You're on the Pro plan. Your limits are gone.");
          clearInterval(timer);
          setSearchParams({}, { replace: true });
          return;
        }
      } catch {
        // try again on the next tick
      }
      if (tries >= 8) {
        clearInterval(timer);
        setNotice("Payment received. If the plan hasn't updated, refresh in a moment.");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [searchParams, setSearchParams, loadBilling]);

  async function createProject(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api(`${base}/projects`, {
        method: "POST",
        token,
        body: { name },
      });
      setProjects([data.project, ...projects]);
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(id) {
    if (!window.confirm("Delete this project and all its tasks?")) return;
    setError("");
    try {
      await api(`${base}/projects/${id}`, { method: "DELETE", token });
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function upgrade() {
    setError("");
    setBusy(true);
    try {
      const data = await api(`${base}/billing/checkout`, {
        method: "POST",
        token,
      });
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
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

      <main className="content">
        <div className="title-row">
          <div>
            <h1>{workspace.name}</h1>
            <p className="muted">Your role: {role}</p>
          </div>
          <span className={`badge ${plan}`}>{plan === "pro" ? "Pro" : "Free"}</span>
        </div>

        {notice && <div className="notice">{notice}</div>}
        {error && <div className="error">{error}</div>}

        {plan === "free" && isAdmin && (
          <div className="card upgrade">
            <div>
              <strong>Upgrade to Pro</strong>
              <p className="muted">Unlimited projects and members for $9/month.</p>
            </div>
            <button onClick={upgrade} disabled={busy}>
              Upgrade
            </button>
          </div>
        )}

        <h2>Projects</h2>
        {plan === "free" && (
          <p className="muted">
            {projects.length} of {FREE_LIMIT} projects used on the Free plan.
          </p>
        )}

        {canEdit && (
          <form className="inline-form" onSubmit={createProject}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New project name"
              required
            />
            <button type="submit" disabled={busy}>
              Add project
            </button>
          </form>
        )}

        {loading ? (
          <p className="muted">Loading...</p>
        ) : projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <div className="grid">
            {projects.map((p) => (
              <div className="card" key={p.id}>
                <h2>{p.name}</h2>
                <p className="muted">{p.description || "No description"}</p>
                {isAdmin && (
                  <button className="secondary" onClick={() => deleteProject(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}