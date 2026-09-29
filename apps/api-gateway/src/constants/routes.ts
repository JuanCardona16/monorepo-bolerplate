export const ApiPrefix: string = "/api/v1";
export const ApiPrefixAuthRoutes: string = "/auth";

export enum PublicRoutes {
  LOGIN = "/login",
  REGISTER = "/register",
  REFRESH = "/refresh",
  LOGOUT = "/logout",
  FORGOT_PASSWORD = "/forgot-password",
  RESET_PASSWORD = "/reset-password",
}

export enum PrivateRoutes {
  ME = "/me",
  USERS = "/users",
}

export enum AdminRoutes {
  // The path already carries the `:uuid` segment, so it composes as
  // `${PrivateRoutes.USERS}${AdminRoutes.CHANGE_USER_ROLES}`. Do not prepend
  // another `:uuid` to it.
  CHANGE_USER_ROLES = "/:uuid/roles",
}
