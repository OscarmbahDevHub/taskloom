import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

export default function Team() {
  const { workspaceId } = useParams();
  const { session, logout } = useAuth();
  const token = session.token;

  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const isAdmin = workspace && workspace.role === "admin";

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const base = `/api/workspaces/${workspaceId}`;

  const load = useCallback(async () => {
    const memberData = await api(`${base}/members`, { token });
    setMembers(memberData.members);
    if (isAdmin) {
      const inviteData = await api(`${base}/invitations`, { token });
      setInvites(inviteData.invitations);
    }
  }, [base, token, isAdmin]);

  useEffect(() => {
    if (!workspace) return;
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspace, load]);

  async function sendInvite(e) {
    e.preventDefault();
    setError("");
    setLink("");
    setCopied(false);
    setBusy(true);
    try {
      const data = await api(`${base}/invitations`, {
        method: "POST",
        token,
        body: { email, role },
      });
      setLink(`${window.location.origin}/invite/${data.invitation.token}`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
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
        <p className="muted">
          <Link to={`/workspaces/${workspaceId}`}>← {workspace.name}</Link>
        </p>
        <h1>Team</h1>

        {error && <div className="error">{error}</div>}

        {isAdmin && (
          <>
            <h2>Invite someone</h2>
            <form className="inline-form" onSubmit={sendInvite}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
              />
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" disabled={busy}>
                Create invite
              </button>
            </form>

            {link && (
              <div className="notice">
                <p>Send this link to your teammate. It's shown only once.</p>
                <div className="invite-link">{link}</div>
                <button className="secondary small" onClick={copyLink}>
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            )}

            {invites.length > 0 && (
              <>
                <h2>Pending invitations</h2>
                {invites.map((i) => (
                  <div className="row" key={i.id}>
                    <span>{i.email}</span>
                    <span className="muted">
                      {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        <h2>Members</h2>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          members.map((m) => (
            <div className="row" key={m.id}>
              <span>
                {m.full_name} <span className="muted">({m.email})</span>
              </span>
              <span className={`badge ${m.role === "admin" ? "pro" : ""}`}>{m.role}</span>
            </div>
          ))
        )}
      </main>
    </div>
  );
}