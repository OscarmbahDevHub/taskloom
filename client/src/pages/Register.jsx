import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    workspaceName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(
        form.fullName,
        form.email,
        form.password,
        form.workspaceName
      );
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Create your workspace</h1>
        <p className="muted">Start organizing your team's projects.</p>

        {error && <div className="error">{error}</div>}

        <label>
          Full name
          <input value={form.fullName} onChange={update("fullName")} required />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={update("email")}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={update("password")}
            minLength={8}
            required
          />
        </label>

        <label>
          Workspace name
          <input
            value={form.workspaceName}
            onChange={update("workspaceName")}
            placeholder="e.g. Acme Inc"
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>

        <p className="muted center">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}