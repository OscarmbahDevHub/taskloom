import { createContext, useContext, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

const STORAGE_KEY = "taskloom_session";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  function save(next) {
    setSession(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function login(email, password) {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    save({ token: data.token, user: data.user, workspaces: data.workspaces });
  }

  async function register(fullName, email, password, workspaceName) {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: { fullName, email, password, workspaceName },
    });
    save({
      token: data.token,
      user: data.user,
      workspaces: [{ ...data.workspace, role: "admin" }],
    });
  }

  async function refresh() {
    const data = await api("/api/auth/me", { token: session.token });
    save({ ...session, user: data.user, workspaces: data.workspaces });
  }

  function logout() {
    save(null);
  }

  return (
    <AuthContext.Provider value={{ session, login, register, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}