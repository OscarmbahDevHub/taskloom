import { useAuth } from "../AuthContext";

export default function Dashboard() {
  const { session, logout } = useAuth();

  return (
    <div className="page">
      <header className="topbar">
        <strong>Taskloom</strong>
        <div className="topbar-right">
          <span className="muted">{session.user.fullName}</span>
          <button className="secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <h1>Your workspaces</h1>
        <div className="grid">
          {session.workspaces.map((w) => (
            <div className="card" key={w.id}>
              <h2>{w.name}</h2>
              <p className="muted">
                Plan: {w.plan} · Role: {w.role}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}