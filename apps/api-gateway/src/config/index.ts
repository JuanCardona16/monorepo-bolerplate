export { CorsConfig } from "./cors/index.js";
// `RESEND_KEY`, `CLIENT_GOOGLE_ID` and `CLIENT_GOOGLE_SECRET` were removed: they
// were left over from the template, are set in no `.env.local`, and were exported
// from the barrel without a single consumer. Declaring an env var that nothing
// reads is a promise the codebase does not keep — a reader reasonably assumes
// password reset and Google login are wired up. Re-add them when those features
// land, together with the code that uses them.
export { PORT, TOKEN_SECRET_KEY, REFRESH_TOKEN_SECRET_KEY, DATABASE_URL } from "./env/index.js";