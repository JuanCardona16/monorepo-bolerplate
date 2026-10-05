/**
 * Test environment, applied to every suite in this package.
 *
 * This exists because the same failure bit this repo three times: a suite
 * imports a module that reaches `config/env/index.ts`, whose `required()` runs
 * AT IMPORT TIME. Setting the variables in `beforeAll` or `vi.stubEnv` inside a
 * test is too late — a plain statement at the top of a file also runs *after* the
 * imports. So a suite without the `vi.hoisted` block passes on a developer
 * machine (which has `.env.local`) and fails on CI (which does not):
 *
 *   Error: Missing required environment variable: TOKEN_SECRET_KEY.
 *
 * A setup file runs before any test module is imported, so it removes the trap
 * instead of documenting it a fourth time.
 *
 * These are placeholders. Suites that need real behaviour pass their own
 * repository/client fakes, and the values here exist so that reading an env var
 * during import does not throw. `MONGODB_URI` points at a closed port on
 * purpose: if a suite ever actually tries to connect, it must fail loudly rather
 * than quietly reaching a database that happens to be running.
 */
process.env.NODE_ENV = "test";
process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
process.env.MONGODB_URI = "mongodb://unused:unused@127.0.0.1:27017/unused";

/**
 * `DOCS_ENABLED` is deliberately left UNSET.
 *
 * Setting it to "true" here was a mistake that cost real coverage: with the
 * value pinned, no suite in the package ever exercised the
 * `DOCS_ENABLED === undefined && NODE_ENV !== "production"` branch, which is
 * the *default* the env var documents. The branch that matters to a developer
 * running locally is the one with nothing set.
 */

/**
 * Set, never deleted.
 *
 * `delete` is exactly backwards here. `dotenv` does not override a variable that
 * is already in `process.env` (verified against dotenv 18.0.4), so deleting the
 * value does not "unset" it for the process: it *frees the name*, and
 * `config/env/index.ts` then runs `dotenv.config()` and re-injects
 * `ACCESS_LOG_IPS=true` from `.env.local`. With a value present, dotenv leaves
 * it alone and the test default actually holds.
 *
 * The same reasoning applies to every line above: they are assignments precisely
 * so that a developer's `.env.local` cannot override them.
 */
process.env.ACCESS_LOG_IPS = "false";
