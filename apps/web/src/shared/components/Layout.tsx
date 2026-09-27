import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { ApiPaths, AppRoutes } from "../../constants/index";
import { api } from "../../infrastructure/http/apiClient";
import { useAuthStore } from "../../features/auth/stores/auth";

export function Layout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const logout = async () => {
    try {
      await api.post(ApiPaths.LOGOUT);
    } catch {
      // Session already invalid — clear locally anyway.
    }
    clear();
    navigate(AppRoutes.LOGIN);
  };

  return (
    <div>
      <nav>
        <Link to={AppRoutes.HOME}>Home</Link>
        {accessToken ? (
          <button type="button" onClick={() => void logout()}>
            Logout
          </button>
        ) : (
          <>
            <Link to={AppRoutes.LOGIN}>Login</Link>
            <Link to={AppRoutes.REGISTER}>Register</Link>
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
    return <Navigate to={AppRoutes.LOGIN} replace />;
  }
  return <>{children}</>;
}
