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
 * during import does not throw. `DATABASE_URL` points at a closed port on
 * purpose: if a suite ever actually tries to connect, it must fail loudly rather
 * than quietly reaching a database that happens to be running.
 */
process.env.NODE_ENV = "test";
process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:5432/unused";

// Non-production defaults, so a suite never depends on a developer's shell.
process.env.DOCS_ENABLED = "true";
delete process.env.ACCESS_LOG_IPS;
