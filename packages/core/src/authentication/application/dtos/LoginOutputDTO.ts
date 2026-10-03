export interface LoginOutputDTO {
  accessToken: string;
  refreshToken: string;
  /** Echoes the session choice so the HTTP layer picks the matching cookie lifetime. */
  rememberMe: boolean;
}
