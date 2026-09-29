import { createBrowserRouter } from "react-router";
import { AppRoutes } from "../../constants/index";
import { Layout, RequireAuth } from "../../shared/components/Layout";
import { NotFoundPage, RouteErrorPage } from "../../shared/components/RouteErrorPage";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { ProfilePage } from "../../features/auth/pages/ProfilePage";
import { RegisterPage } from "../../features/auth/pages/RegisterPage";
import { ForgotPasswordPage } from "../../features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../../features/auth/pages/ResetPasswordPage";

export const router = createBrowserRouter([
  {
    // Any render-time throw in a route component lands here instead of the bare
    // unstyled React Router default, which showed no navigation at all.
    errorElement: <RouteErrorPage />,
    element: <Layout />,
    children: [
      { path: AppRoutes.LOGIN, element: <LoginPage /> },
      { path: AppRoutes.REGISTER, element: <RegisterPage /> },
      // Public, like the login they lead to and from: a reset link is followed
      // by someone who cannot sign in yet.
      { path: AppRoutes.FORGOT_PASSWORD, element: <ForgotPasswordPage /> },
      { path: AppRoutes.RESET_PASSWORD, element: <ResetPasswordPage /> },
      {
        path: AppRoutes.HOME,
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      // Unknown paths render inside the Layout, so the navbar stays reachable.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
