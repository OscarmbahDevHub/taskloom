import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { formatMoney } from "../format";

const FREE_LIMIT = 3;

function ValueInput({ cents, onSave }) {
  const [text, setText] = useState(String(cents / 100));

  function commit() {
    const number = Number(text);
    if (text === "" || !Number.isFinite(number) || number < 0) {
      setText(String(cents / 100));
      return;
    }
    if (Math.round(number * 100) !== cents) onSave(number);
  }

  return (
    <input
      className="value-input"
      type="number"
      min="0"
      step="0.01"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      aria-label="Project value in USD"
    />
  );
}

export default function Workspace() {
  const { workspaceId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);

  const [plan, setPlan] = useState(workspace ? workspace.plan : "free");
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [value, setValue] = useState("");
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

  const loadClients = useCallback(async () => {
    const data = await api(`${base}/clients`, { token });
    setClients(data.clients);
  }, [base, token]);

  const loadBilling = useCallback(async () => {
    const data = await api(`${base}/billing`, { token });
    setPlan(data.plan);
    return data.plan;
  }, [base, token]);

  useEffect(() => {
    if (!workspace) return;
    Promise.all([loadProjects(), loadClients(), loadBilling()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspace, loadProjects, loadClients, loadBilling]);

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
        body: {
          name,
          clientId: clientId || undefined,
          value: value === "" ? undefined : Number(value),
        },
      });
      setProjects([data.project, ...projects]);
      setName("");
      setClientId("");
      setValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateProject(id, body) {
    setError("");
    try {
      const data = await api(`${base}/projects/${id}`, {
        method: "PATCH",
        token,
        body,
      });
      setProjects(projects.map((p) => (p.id === id ? data.project : p)));
    } catch (err) {
      setError(err.message);
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
      <div>
        <h1>Workspace not found</h1>
        <Link to="/">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="title-row">
        <div>
          <h1>Projects</h1>
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
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="value-input"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value (USD)"
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
              <h2>
                <Link to={`/workspaces/${workspaceId}/projects/${p.id}`}>{p.name}</Link>
              </h2>
              <p className="muted">{p.description || "No description"}</p>

              <div className="project-meta">
                {canEdit ? (
                  <>
                    <select
                      value={p.client_id || ""}
                      onChange={(e) =>
                        updateProject(p.id, { clientId: e.target.value || null })
                      }
                    >
                      <option value="">No client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ValueInput
                      key={`${p.id}-${p.value_cents}`}
                      cents={p.value_cents}
                      onSave={(dollars) => updateProject(p.id, { value: dollars })}
                    />
                  </>
                ) : (
                  <>
                    <span className="muted">{p.client_name || "No client"}</span>
                    <strong>{formatMoney(p.value_cents)}</strong>
                  </>
                )}
              </div>

              {isAdmin && (
                <button className="secondary" onClick={() => deleteProject(p.id)}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}