import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reset flow swallows every error from the email sender, on purpose, so a
 * broken adapter can never turn `forgot` into an account-enumeration oracle.
 *
 * That silence has a cost: a misconfiguration becomes invisible. These tests
 * cover the boundary between the two. "Must not break the boot" and "must not be
 * silent" are different requirements, and only the second one was being met.
 */
const load = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  const module = await import("../config/env/index.js");
  return {
    module,
    restore: () => {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    },
  };
};

let restore: () => void = () => undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  restore();
  restore = () => undefined;
});

const PROD_BASE = {
  NODE_ENV: "production",
  TOKEN_SECRET_KEY: "s",
  REFRESH_TOKEN_SECRET_KEY: "s",
  MONGODB_URI: "mongodb://u:u@127.0.0.1:27017/u",
  RESEND_API_KEY: undefined,
  PASSWORD_RESET_URL: undefined,
  EMAIL_FROM: undefined,
};

describe("reset feature misconfiguration", () => {
  it("warns in production when PASSWORD_RESET_URL is missing", async () => {
    const { module, restore: r } = await load(PROD_BASE);
    restore = r;

    // The emails would otherwise be delivered with a link pointing at
    // localhost: valid email, dead link, and nothing anywhere reporting it.
    expect(module.PASSWORD_RESET_URL).toContain("localhost");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("PASSWORD_RESET_URL"),
    );
  });

  it("stays quiet about it outside production", async () => {
    const { restore: r } = await load({ ...PROD_BASE, NODE_ENV: "test" });
    restore = r;

    // A developer running locally always hits this, so warning on every boot
    // would train everyone to ignore warnings.
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("stays quiet when the feature is actually configured", async () => {
    const { restore: r } = await load({
      ...PROD_BASE,
      RESEND_API_KEY: "re_test",
      PASSWORD_RESET_URL: "https://app.example.com/reset-password",
      EMAIL_FROM: "no-reply@example.com",
    });
    restore = r;

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns about a missing RESEND_API_KEY too, since nothing is delivered", async () => {
    const { restore: r } = await load({
      ...PROD_BASE,
      PASSWORD_RESET_URL: "https://app.example.com/reset-password",
      EMAIL_FROM: "no-reply@example.com",
    });
    restore = r;

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY"),
    );
  });

  it("warns about EMAIL_FROM, because Resend bounces an unverified sender", async () => {
    const { restore: r } = await load({
      ...PROD_BASE,
      RESEND_API_KEY: "re_test",
      PASSWORD_RESET_URL: "https://app.example.com/reset-password",
    });
    restore = r;

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("EMAIL_FROM"));
  });

  // A missing optional feature must never stop login from booting. The whole
  // point of making these warnings instead of `required()` is that.
  it("does not throw, so login still boots without the reset feature", async () => {
    const { module, restore: r } = await load(PROD_BASE);
    restore = r;

    expect(module.TOKEN_SECRET_KEY).toBe("s");
    expect(module.RESEND_API_KEY).toBe("");
  });
});
