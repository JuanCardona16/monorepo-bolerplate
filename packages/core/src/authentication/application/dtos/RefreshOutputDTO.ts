export interface RefreshOutputDTO {
  accessToken: string;
  refreshToken: string;
  /** Echoes the stored session choice so rotation never silently upgrades a short session. */
  rememberMe: boolean;
}
