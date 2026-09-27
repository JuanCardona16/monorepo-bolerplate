import { Link, Navigate, Outlet, useNavigate } from "react-router";
import { ApiPaths, AppRoutes } from "../../constants/index";
import { api } from "../../infrastructure/http/apiClient";
import { useAuthStore } from "../../features/auth/stores/auth";

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="20" height="20" rx="5" fill="#22c55e" />
      <path
        d="M7 11.5l3 3 5-6"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <nav className="nav" aria-label="Main">
        <Link to={AppRoutes.HOME} className="brand">
          <BrandMark />
          Auth App
        </Link>
        <div className="nav-links">
          {accessToken ? (
            <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
              Logout
            </button>
          ) : (
            <>
              <Link to={AppRoutes.LOGIN}>Login</Link>
              <Link to={AppRoutes.REGISTER}>Register</Link>
            </>
          )}
        </div>
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
