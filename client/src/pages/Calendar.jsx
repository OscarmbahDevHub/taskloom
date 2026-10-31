import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PER_DAY = 3;

function pad(n) {
  return String(n).padStart(2, "0");
}

function toKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function taskTone(task, todayKey) {
  if (task.status === "done") return "green";
  if (task.due_date < todayKey) return "red";
  if (task.status === "in_progress") return "blue";
  return "gray";
}

export default function Calendar() {
  const { workspaceId } = useParams();
  const { session } = useAuth();

  const now = new Date();
  const todayKey = toKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [tasks, setTasks] = useState([]);
  const [undated, setUndated] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const monthKey = `${cursor.year}-${pad(cursor.month + 1)}`;

  useEffect(() => {
    let ignore = false;

    api(`/api/workspaces/${workspaceId}/calendar?month=${monthKey}`, {
      token: session.token,
    })
      .then((data) => {
        if (ignore) return;
        setTasks(data.tasks);
        setUndated(data.undated);
        setError("");
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [workspaceId, monthKey, session.token]);

  const byDay = useMemo(() => {
    const map = {};
    for (const task of tasks) {
      if (!map[task.due_date]) map[task.due_date] = [];
      map[task.due_date].push(task);
    }
    return map;
  }, [tasks]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor]);

  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });

  function shift(amount) {
    const next = new Date(cursor.year, cursor.month + amount, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function goToday() {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  return (
    <div>
      <div className="title-row">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Tasks by due date across your workspace.</p>
        </div>
        <div className="range-toggle">
          <button className="secondary small" onClick={() => shift(-1)}>
            Previous
          </button>
          <button className="secondary small" onClick={goToday}>
            Today
          </button>
          <button className="secondary small" onClick={() => shift(1)}>
            Next
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chart-card">
        <div className="section-head">
          <h2>{label}</h2>
          <div className="legend">
            <span className="tag gray">To do</span>
            <span className="tag blue">In progress</span>
            <span className="tag green">Done</span>
            <span className="tag red">Overdue</span>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <div className="cal-grid">
            {WEEKDAYS.map((day) => (
              <div className="cal-weekday" key={day}>
                {day}
              </div>
            ))}

            {cells.map((day, index) => {
              if (day === null) {
                return <div className="cal-cell empty" key={`blank-${index}`} />;
              }

              const key = toKey(cursor.year, cursor.month, day);
              const dayTasks = byDay[key] || [];
              const extra = dayTasks.length - MAX_PER_DAY;

              return (
                <div
                  className={key === todayKey ? "cal-cell today" : "cal-cell"}
                  key={key}
                >
                  <span className="cal-day">{day}</span>

                  {dayTasks.slice(0, MAX_PER_DAY).map((task) => (
                    <Link
                      key={task.id}
                      className={`cal-task ${taskTone(task, todayKey)}`}
                      to={`/workspaces/${workspaceId}/projects/${task.project_id}`}
                      title={`${task.title} (${task.project_name})`}
                    >
                      {task.title}
                    </Link>
                  ))}

                  {extra > 0 && <span className="cal-more">+{extra} more</span>}
                </div>
              );
            })}
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <p className="muted">No tasks are due in {label}.</p>
        )}
      </div>

      {undated > 0 && (
        <p className="muted">
          {undated} open {undated === 1 ? "task has" : "tasks have"} no due date, so{" "}
          {undated === 1 ? "it doesn't" : "they don't"} appear here.
        </p>
      )}
    </div>
  );
}