import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const RANGES = [7, 14, 30];

const STATUS_ROWS = [
  { key: "todo", label: "To do", color: "#9ca3af" },
  { key: "in_progress", label: "In progress", color: "#38bdf8" },
  { key: "done", label: "Done", color: "#4f46e5" },
];

function shortDate(day) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
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

export default function Analytics() {
  const { workspaceId } = useParams();
  const { session } = useAuth();
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/workspaces/${workspaceId}/analytics?days=${days}`, {
      token: session.token,
    })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [workspaceId, days, session.token]);

  return (
    <div>
      <h1>Analytics</h1>
      <p className="muted">How your workspace is performing, based on real task data.</p>

      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Loading...</p>}

      {data && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Team productivity"
              value={data.productivity.percent === null ? "-" : `${data.productivity.percent}%`}
              hint={
                data.productivity.total === 0
                  ? "Finish tasks that have due dates"
                  : `${data.productivity.onTime} of ${data.productivity.total} finished on time`
              }
            />
            <StatCard
              label="Tasks completed"
              value={data.counts.done}
              hint={`of ${data.counts.total} tasks`}
            />
            <StatCard
              label="In progress"
              value={data.counts.in_progress}
              hint={`${data.counts.todo} still to do`}
            />
            <StatCard
              label="Overdue tasks"
              value={data.counts.overdue}
              hint="past due and not done"
            />
          </div>

          <div className="chart-card">
            <div className="section-head">
              <h2>Project performance</h2>
              <div className="range-toggle">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    className={r === days ? "range active" : "range"}
                    onClick={() => setDays(r)}
                  >
                    {r} days
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.timeline} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickFormatter={shortDate} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={shortDate} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="active"
                    name="Active"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="overdue"
                    name="Overdue"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {data.counts.total === 0 && (
              <p className="muted">No tasks yet. Add some tasks and the chart will fill in.</p>
            )}
          </div>

          <div className="chart-card">
            <h2>Tasks by status</h2>
            {STATUS_ROWS.map((row) => {
              const count = data.counts[row.key];
              const percent = data.counts.total
                ? Math.round((count / data.counts.total) * 100)
                : 0;
              return (
                <div className="status-row" key={row.key}>
                  <span>{row.label}</span>
                  <div className="progress">
                    <div
                      className="progress-bar"
                      style={{ width: `${percent}%`, background: row.color }}
                    />
                  </div>
                  <span className="percent">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}