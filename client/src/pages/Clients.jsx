import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { formatMoney } from "../format";

function monthLabel(key) {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString("en", { month: "short" });
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

export default function Clients() {
  const { workspaceId } = useParams();
  const { session } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const role = workspace ? workspace.role : null;
  const canEdit = role === "admin" || role === "member";
  const isAdmin = role === "admin";

  const [clients, setClients] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const base = `/api/workspaces/${workspaceId}`;

  useEffect(() => {
    Promise.all([
      api(`${base}/clients`, { token }),
      api(`${base}/revenue`, { token }),
    ])
      .then(([clientData, revenueData]) => {
        setClients(clientData.clients);
        setRevenue(revenueData);
      })
      .catch((err) => setError(err.message));
  }, [base, token]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function addClient(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api(`${base}/clients`, {
        method: "POST",
        token,
        body: form,
      });
      setClients([
        { ...data.client, project_count: 0, total_value_cents: 0 },
        ...clients,
      ]);
      setForm({ name: "", email: "", company: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteClient(client) {
    if (!window.confirm("Delete this client? Their projects stay but lose the client link.")) {
      return;
    }
    setError("");
    try {
      await api(`${base}/clients/${client.id}`, { method: "DELETE", token });
      setClients(clients.filter((c) => c.id !== client.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const chartData = revenue
    ? revenue.months.map((m) => ({ month: m.month, revenue: m.revenueCents / 100 }))
    : [];

  let changeHint = "No revenue last month";
  if (revenue && revenue.changePercent !== null) {
    const sign = revenue.changePercent >= 0 ? "+" : "";
    changeHint = `${sign}${revenue.changePercent}% vs last month`;
  }

  return (
    <div>
      <h1>Clients</h1>
      <p className="muted">
        Revenue counts a project's value in the month its last task is completed.
      </p>

      {error && <div className="error">{error}</div>}

      {revenue && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Revenue this month"
              value={formatMoney(revenue.thisMonthCents)}
              hint={changeHint}
            />
            <StatCard
              label="Earned all time"
              value={formatMoney(revenue.earnedCents)}
              hint="from finished projects"
            />
            <StatCard
              label="In the pipeline"
              value={formatMoney(revenue.pipelineCents)}
              hint="value of unfinished projects"
            />
            <StatCard label="Clients" value={clients.length} hint="in this workspace" />
          </div>

          <div className="chart-card">
            <h2>Monthly revenue</h2>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={monthLabel}
                    formatter={(v) => [formatMoney(v * 100), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {revenue.earnedCents === 0 && (
              <p className="muted">
                Give a project a value, then finish all its tasks, and it shows up here.
              </p>
            )}
          </div>
        </>
      )}

      {canEdit && (
        <>
          <h2>Add a client</h2>
          <form className="inline-form" onSubmit={addClient}>
            <input
              value={form.name}
              onChange={update("name")}
              placeholder="Client name"
              required
            />
            <input
              value={form.company}
              onChange={update("company")}
              placeholder="Company (optional)"
            />
            <input
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="Email (optional)"
            />
            <button type="submit" disabled={busy}>
              Add client
            </button>
          </form>
        </>
      )}

      <h2>All clients</h2>
      {clients.length === 0 && <p className="muted">No clients yet.</p>}

      {clients.map((client) => (
        <div className="row" key={client.id}>
          <div className="row-main">
            <strong>{client.name}</strong>
            <span className="muted">
              {[client.company, client.email].filter(Boolean).join(" · ") || "No details"}
            </span>
          </div>
          <div className="row-side">
            <span className="muted">
              {client.project_count} {client.project_count === 1 ? "project" : "projects"} ·{" "}
              {formatMoney(client.total_value_cents)}
            </span>
            {isAdmin && (
              <button className="secondary small" onClick={() => deleteClient(client)}>
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}