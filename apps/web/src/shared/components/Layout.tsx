import { Link, Navigate, Outlet, useNavigate } from "react-router";
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
    <div className="min-h-screen bg-coal">
      <nav aria-label="Main" className="flex items-center gap-4 bg-coal px-6 py-3">
        <Link to={AppRoutes.HOME} className="font-bold text-white no-underline">
          Auth App
        </Link>
        <div className="ml-auto flex items-center gap-4">
          {accessToken ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="cursor-pointer rounded-full bg-smoke px-4 py-2 text-sm font-semibold text-ink transition-opacity duration-150 hover:opacity-80"
            >
              Logout
            </button>
          ) : (
            <>
              <Link to={AppRoutes.LOGIN} className="text-sm text-white">
                Login
              </Link>
              <Link to={AppRoutes.REGISTER} className="text-sm text-white">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
      <Outlet />
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
