export interface LoginInputDTO {
  email: string;
  password: string;
  /**
   * Explicit opt-in to a 30-day session. Absent or false means a 24h session.
   * The default is short on purpose: a long session must be chosen, never assumed.
   */
  rememberMe?: boolean;
}
