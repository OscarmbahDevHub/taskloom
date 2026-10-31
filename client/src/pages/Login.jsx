import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

const DEMO = { email: "demo-admin@taskloom.test", password: "DemoPass123!" };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(emailValue, passwordValue) {
    setError("");
    setLoading(true);
    try {
      await login(emailValue, passwordValue);
      navigate("/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    signIn(email, password);
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to your Taskloom workspace.</p>

        {error && <div className="error">{error}</div>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>

        <div className="divider">or</div>

        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => signIn(DEMO.email, DEMO.password)}
        >
          Try the demo
        </button>
        <p className="muted center small-note">
          Explore a sample workspace full of example data. No sign-up needed.
        </p>

        <p className="muted center">
          New to Taskloom? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}