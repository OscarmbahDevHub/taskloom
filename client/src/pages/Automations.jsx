import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

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

function describeRule(rule) {
  const when = `When a task moves to ${STATUS_LABELS[rule.trigger_status]}`;
  if (rule.action === "notify_admins") return `${when}, notify all admins`;
  return `${when}, assign it to ${rule.action_user_name || "a former member"}`;
}

export default function Automations() {
  const { workspaceId } = useParams();
  const { session } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const isAdmin = workspace && workspace.role === "admin";

  const [rules, setRules] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    triggerStatus: "done",
    action: "notify_admins",
    actionUserId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const base = `/api/workspaces/${workspaceId}`;

  const load = useCallback(async () => {
    const [ruleData, noteData, memberData] = await Promise.all([
      api(`${base}/automations`, { token }),
      api(`${base}/notifications`, { token }),
      api(`${base}/members`, { token }),
    ]);
    setRules(ruleData.automations);
    setNotifications(noteData.notifications);
    setUnread(noteData.unreadCount);
    setMembers(memberData.members);
  }, [base, token]);

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function createRule(e) {
    e.preventDefault();
    if (form.action === "assign_to" && !form.actionUserId) {
      setError("Choose who the task should be assigned to");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api(`${base}/automations`, {
        method: "POST",
        token,
        body: {
          name: form.name,
          triggerStatus: form.triggerStatus,
          action: form.action,
          actionUserId: form.action === "assign_to" ? form.actionUserId : undefined,
        },
      });
      setForm({ ...form, name: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule) {
    setError("");
    try {
      await api(`${base}/automations/${rule.id}`, {
        method: "PATCH",
        token,
        body: { active: !rule.active },
      });
      setRules(rules.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeRule(rule) {
    if (!window.confirm("Delete this automation?")) return;
    setError("");
    try {
      await api(`${base}/automations/${rule.id}`, { method: "DELETE", token });
      setRules(rules.filter((r) => r.id !== rule.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAllRead() {
    setError("");
    try {
      await api(`${base}/notifications/read-all`, { method: "POST", token });
      await load();
      window.dispatchEvent(new Event("taskloom:notifications"));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Automations</h1>
      <p className="muted">
        Rules run automatically whenever a task changes status.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="section-head">
        <h2>Notifications {unread > 0 && <span className="count">{unread}</span>}</h2>
        {unread > 0 && (
          <button className="secondary small" onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      <div className="activity-card">
        {loading && <p className="muted">Loading...</p>}
        {!loading && notifications.length === 0 && (
          <p className="muted">
            Nothing yet. Notifications from your automations will show up here.
          </p>
        )}
        {notifications.map((n) => (
          <div className={n.read_at ? "note-item" : "note-item unread"} key={n.id}>
            <span>{n.message}</span>
            <span className="muted">{timeAgo(n.created_at)}</span>
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 28 }}>
        <h2>Rules</h2>
      </div>

      {isAdmin && (
        <form className="inline-form" onSubmit={createRule}>
          <input
            value={form.name}
            onChange={update("name")}
            placeholder="Rule name, e.g. Tell admins when done"
            required
          />
          <select value={form.triggerStatus} onChange={update("triggerStatus")}>
            <option value="todo">When moved to To do</option>
            <option value="in_progress">When moved to In progress</option>
            <option value="done">When moved to Done</option>
          </select>
          <select value={form.action} onChange={update("action")}>
            <option value="notify_admins">Notify all admins</option>
            <option value="assign_to">Assign to a member</option>
          </select>
          {form.action === "assign_to" && (
            <select value={form.actionUserId} onChange={update("actionUserId")}>
              <option value="">Choose a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" disabled={busy}>
            Add rule
          </button>
        </form>
      )}

      {!loading && rules.length === 0 && <p className="muted">No automations yet.</p>}

      {rules.map((rule) => (
        <div className="row" key={rule.id}>
          <div className="row-main">
            <strong>{rule.name}</strong>
            <span className="muted">{describeRule(rule)}</span>
            <span className="muted">
              Ran {rule.run_count} {rule.run_count === 1 ? "time" : "times"}
              {rule.last_run_at ? ` · last ${timeAgo(rule.last_run_at)}` : ""}
            </span>
          </div>
          <div className="row-side">
            <span className={`tag ${rule.active ? "green" : "gray"}`}>
              {rule.active ? "Active" : "Paused"}
            </span>
            {isAdmin && (
              <>
                <button className="secondary small" onClick={() => toggleRule(rule)}>
                  {rule.active ? "Pause" : "Resume"}
                </button>
                <button className="secondary small" onClick={() => removeRule(rule)}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}