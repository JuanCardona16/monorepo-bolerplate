import { createBrowserRouter } from "react-router-dom";
import { AppRoutes } from "../../constants/index";
import { Layout, RequireAuth } from "../../shared/components/Layout";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { ProfilePage } from "../../features/auth/pages/ProfilePage";
import { RegisterPage } from "../../features/auth/pages/RegisterPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: AppRoutes.LOGIN, element: <LoginPage /> },
      { path: AppRoutes.REGISTER, element: <RegisterPage /> },
      {
        path: AppRoutes.HOME,
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
    ],
  },
]);
