import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { api } from "../app/api.js";
import { useAuthStore } from "../stores/auth.js";

export function Layout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const logout = async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Session already invalid — clear locally anyway.
    }
    clear();
    navigate("/login");
  };

  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        {accessToken ? (
          <button type="button" onClick={() => void logout()}>
            Logout
          </button>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
