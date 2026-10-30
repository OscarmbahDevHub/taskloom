import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

export default function AcceptInvite() {
  const { token: inviteToken } = useParams();
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("taskloom_return_to");
  }, []);

  async function accept() {
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/invitations/accept", {
        method: "POST",
        token: session.token,
        body: { token: inviteToken },
      });
      await refresh();
      navigate(`/workspaces/${data.workspace.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>You've been invited</h1>
        <p className="muted">
          Signed in as {session.user.email}. Accept to join the workspace.
        </p>

        {error && <div className="error">{error}</div>}

        <button onClick={accept} disabled={busy}>
          {busy ? "Joining..." : "Accept invitation"}
        </button>

        <p className="muted center">
          <Link to="/">Back to dashboard</Link>
        </p>
      </div>
    </div>
  );
}