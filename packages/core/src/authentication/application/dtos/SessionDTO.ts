/**
 * The session a client receives in a response body.
 *
 * The refresh token is absent on purpose: it travels in an HttpOnly cookie, so
 * it is never readable by script and never appears in a JSON payload. This is
 * therefore narrower than `LoginOutputDTO` and `RefreshOutputDTO`, which are
 * the use case outputs *before* the cookie transport strips the refresh token
 * out of the body.
 *
 * It lives here so the client-visible shape has one owner. Re-declaring
 * `{ accessToken: string }` in a consumer is how the two sides drift: the day
 * the gateway adds a field, a hand-written copy compiles clean and quietly
 * drops it.
 */
export interface SessionDTO {
  accessToken: string;
}
