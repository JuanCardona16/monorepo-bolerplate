import { describe, expect, it, vi } from "vitest";

import { EmailSendError } from "@repo/core/authentication";

import { ResendEmailSender } from "../ResendEmailSender.js";

const API_KEY = "re_test_key";
const FROM = "no-reply@example.com";
const RAW_TOKEN = "raw-token-abc";

function message(text = `Reset link: https://app.test/reset-password#token=${RAW_TOKEN}`) {
  return { to: "user@example.com", subject: "Reset your password", text };
}

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function makeSender(fetchImpl: typeof fetch, onFailure = vi.fn()) {
  return { sender: new ResendEmailSender({ apiKey: API_KEY, from: FROM, fetchImpl, onFailure }), onFailure };
}

describe("ResendEmailSender", () => {
  describe("request", () => {
    it("posts to the Resend endpoint with the API key as a bearer token", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse());
      const { sender } = makeSender(fetchImpl as unknown as typeof fetch);

      await sender.send(message());

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    });

    it("sends the recipient, subject and body", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse());
      const { sender } = makeSender(fetchImpl as unknown as typeof fetch);

      await sender.send(message());

      const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body).toEqual({
        from: FROM,
        to: ["user@example.com"],
        subject: "Reset your password",
        text: `Reset link: https://app.test/reset-password#token=${RAW_TOKEN}`,
      });
    });

    it("omits the html key when there is no html part", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse());
      const { sender } = makeSender(fetchImpl as unknown as typeof fetch);

      await sender.send(message());

      const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body).not.toHaveProperty("html");
    });

    it("includes the html part when one is supplied", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse());
      const { sender } = makeSender(fetchImpl as unknown as typeof fetch);

      await sender.send({ ...message(), html: "<p>hi</p>" });

      const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body.html).toBe("<p>hi</p>");
    });

    it("resolves without throwing on a 200", async () => {
      const { sender } = makeSender(vi.fn().mockResolvedValue(okResponse()) as unknown as typeof fetch);

      await expect(sender.send(message())).resolves.toBeUndefined();
    });
  });

  describe("failures", () => {
    it("throws EmailSendError when the provider rejects the message", async () => {
      const { sender } = makeSender(
        vi.fn().mockResolvedValue({ ok: false, status: 422 } as Response) as unknown as typeof fetch,
      );

      await expect(sender.send(message())).rejects.toThrow(EmailSendError);
    });

    it("throws EmailSendError when the network is down", async () => {
      const { sender } = makeSender(
        vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
      );

      await expect(sender.send(message())).rejects.toThrow(EmailSendError);
    });

    it("tags the error with a code the gateway can map", async () => {
      const { sender } = makeSender(
        vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
      );

      const error = await sender.send(message()).catch((e: unknown) => e);

      expect((error as EmailSendError).code).toBe("EMAIL_SEND_FAILED");
    });
  });

  /**
   * The token is the whole security property of this adapter's logging: an
   * error string is exactly the kind of thing that gets pasted into a ticket
   * and then sits in a log aggregator for a year. A log line that contains a
   * live reset token is a password reset waiting to happen.
   */
  /**
   * These assert on `console.error` itself, not only on the injected
   * `onFailure` hook.
   *
   * The hook assertions alone were not enough, and the reason is worth
   * recording: they pass for any implementation that routes its logging through
   * the callback, so a real `console.error(message.text)` sitting next to it
   * slipped past all of them. A logging guard has to watch the actual sink,
   * because the actual sink is what an operator reads.
   */
  describe("console output on failure", () => {
    function captureConsole(): { lines: string[]; restore: () => void } {
      const lines: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
      return { lines, restore: () => spy.mockRestore() };
    }

    it("writes nothing containing the token when the provider rejects", async () => {
      const { lines, restore } = captureConsole();
      try {
        const { sender } = makeSender(
          vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
        );
        await sender.send(message()).catch(() => undefined);
      } finally {
        restore();
      }

      expect(lines.join("\n")).not.toContain(RAW_TOKEN);
    });

    it("writes nothing containing the token when the network is down", async () => {
      const { lines, restore } = captureConsole();
      try {
        const { sender } = makeSender(
          vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
        );
        await sender.send(message()).catch(() => undefined);
      } finally {
        restore();
      }

      expect(lines.join("\n")).not.toContain(RAW_TOKEN);
    });

    it("keeps the link out of the output entirely, token aside", async () => {
      const { lines, restore } = captureConsole();
      try {
        const { sender } = makeSender(
          vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
        );
        await sender.send(message()).catch(() => undefined);
      } finally {
        restore();
      }

      expect(lines.join("\n")).not.toContain("#token=");
    });

    it("still says something useful, because a silent failure is not debuggable", async () => {
      // Built WITHOUT the `onFailure` override on purpose: injecting a stub
      // replaces the real logger, so a test that asserts on the console while
      // injecting one asserts nothing at all. That is exactly the mistake this
      // suite was written to close.
      const { lines, restore } = captureConsole();
      try {
        const sender = new ResendEmailSender({
          apiKey: API_KEY,
          from: FROM,
          fetchImpl: vi
            .fn()
            .mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
        });
        await sender.send(message()).catch(() => undefined);
      } finally {
        restore();
      }

      // The recipient is the one piece of context that is safe to keep and the
      // one that makes the line actionable.
      expect(lines.join("\n")).toContain("user@example.com");
    });

    it("says something useful on a network failure too", async () => {
      const { lines, restore } = captureConsole();
      try {
        const sender = new ResendEmailSender({
          apiKey: API_KEY,
          from: FROM,
          fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
        });
        await sender.send(message()).catch(() => undefined);
      } finally {
        restore();
      }

      expect(lines.join("\n")).toContain("user@example.com");
    });
  });

  describe("failure logging", () => {
    it("never writes the token, not on a rejection", async () => {
      const { sender, onFailure } = makeSender(
        vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
      );

      await sender.send(message()).catch(() => undefined);

      const logged = JSON.stringify(onFailure.mock.calls);
      expect(logged).not.toContain(RAW_TOKEN);
    });

    it("never writes the token, not on a network failure", async () => {
      const { sender, onFailure } = makeSender(
        vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
      );

      await sender.send(message()).catch(() => undefined);

      expect(JSON.stringify(onFailure.mock.calls)).not.toContain(RAW_TOKEN);
    });

    it("keeps the token out of the thrown error message too", async () => {
      const { sender } = makeSender(
        vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
      );

      const error = await sender.send(message()).catch((e: unknown) => e);

      expect((error as Error).message).not.toContain(RAW_TOKEN);
    });

    it("keeps the token out of the message on a network failure", async () => {
      const { sender } = makeSender(
        vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch,
      );

      const error = await sender.send(message()).catch((e: unknown) => e);

      expect((error as Error).message).not.toContain(RAW_TOKEN);
    });

    it("reports the recipient, which is what makes the line actionable", async () => {
      const { sender, onFailure } = makeSender(
        vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch,
      );

      await sender.send(message()).catch(() => undefined);

      expect(onFailure).toHaveBeenCalledWith("user@example.com", "status-500");
    });

    it("reports nothing when the delivery succeeds", async () => {
      const { sender, onFailure } = makeSender(vi.fn().mockResolvedValue(okResponse()) as unknown as typeof fetch);

      await sender.send(message());

      expect(onFailure).not.toHaveBeenCalled();
    });
  });
});
