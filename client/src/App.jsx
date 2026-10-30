import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import ProjectBoard from "./pages/ProjectBoard";
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";

const RETURN_KEY = "taskloom_return_to";

function Protected({ children }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    if (location.pathname.startsWith("/invite/")) {
      sessionStorage.setItem(RETURN_KEY, location.pathname);
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { session } = useAuth();
  return session ? <Navigate to="/" replace /> : children;
}

function Home() {
  const target = sessionStorage.getItem(RETURN_KEY);
  if (target) {
    return <Navigate to={target} replace />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Protected>
            <Home />
          </Protected>
        }
      />
      <Route
        path="/invite/:token"
        element={
          <Protected>
            <AcceptInvite />
          </Protected>
        }
      />
      <Route
        path="/workspaces/:workspaceId"
        element={
          <Protected>
            <Workspace />
          </Protected>
        }
      />
      <Route
        path="/workspaces/:workspaceId/team"
        element={
          <Protected>
            <Team />
          </Protected>
        }
      />
      <Route
        path="/workspaces/:workspaceId/projects/:projectId"
        element={
          <Protected>
            <ProjectBoard />
          </Protected>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}