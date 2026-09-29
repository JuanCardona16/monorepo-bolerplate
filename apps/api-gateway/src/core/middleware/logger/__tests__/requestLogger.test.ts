import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequestLogger } from "../requestLogger.js";

/**
 * Access log contract.
 *
 * Most of these tests are about what the log must NOT contain. The positive
 * cases are one assertion each; the negative ones are the reason the middleware
 * exists at all, because a log that leaks a password cannot be un-leaked.
 */

type Handler = (...args: unknown[]) => void;

function createFakeExchange() {
  const handlers = new Map<string, Handler[]>();
  const req = {
    method: "GET",
    // Deliberately different: if the implementation used `originalUrl` this
    // query string would show up in the log line.
    path: "/api/v1/auth/login",
    originalUrl: "/api/v1/auth/login?email=someone@example.com&token=s3cr3t",
    ip: "203.0.113.7",
    body: { email: "someone@example.com", password: "hunter2" },
    headers: { authorization: "Bearer eyJhbGciOi.super-secret-jwt" },
  };
  const res = {
    statusCode: 200,
    writableEnded: false,
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return res;
    },
  };

  return {
    req,
    res,
    run() {
      const next = vi.fn();
      const logger = createRequestLogger({ write: lines.push, ...overrides });
      logger(req as never, res as never, next as never);
      return next;
    },
    finish() {
      res.writableEnded = true;
      (handlers.get("finish") ?? []).forEach((h) => h());
    },
    close() {
      (handlers.get("close") ?? []).forEach((h) => h());
    },
  };
}

let lines: string[];
let overrides: { includeIp?: boolean; write?: (line: string) => void };

beforeEach(() => {
  lines = [];
  overrides = { includeIp: false, write: (line) => lines.push(line) };
});

describe("createRequestLogger", () => {
  it("calls next so the request is not blocked", () => {
    const exchange = createFakeExchange();
    expect(exchange.run()).toHaveBeenCalledOnce();
  });

  it("logs one line with method, path, status and duration", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"GET /api/v1/auth/login"');
    expect(lines[0]).toContain("200");
    expect(lines[0]).toMatch(/\d+\.\dms/);
  });

  // The reason the middleware logs `req.path` and never `req.originalUrl`.
  it("never logs the query string", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines[0]).not.toContain("someone@example.com");
    expect(lines[0]).not.toContain("s3cr3t");
    expect(lines[0]).not.toContain("?");
  });

  it("never logs the Authorization header", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines[0]).not.toContain("super-secret-jwt");
    expect(lines[0]).not.toContain("Bearer");
  });

  it("never logs the body", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines[0]).not.toContain("hunter2");
  });

  it("omits the client IP by default, since an IP is personal data", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines[0]).not.toContain("203.0.113.7");
    expect(lines[0]).toContain("-");
  });

  it("includes the client IP when explicitly enabled", () => {
    overrides = { includeIp: true, write: (line) => lines.push(line) };
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();

    expect(lines[0]).toContain("203.0.113.7");
  });

  // `finish` and `close` both fire for a normal request. Logging twice would
  // double-count every single request in the log.
  it("logs exactly once when both finish and close fire", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();
    exchange.close();

    expect(lines).toHaveLength(1);
  });

  it("logs an aborted request that never finished", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.close();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("aborted");
  });

  it("does not mark a closed-after-finish request as aborted", () => {
    const exchange = createFakeExchange();
    exchange.run();
    exchange.finish();
    exchange.close();

    expect(lines[0]).not.toContain("aborted");
  });

  // Losing a log line is strictly better than turning every request into a 500.
  it("never fails the request when the log write throws", () => {
    overrides = {
      includeIp: false,
      write: () => {
        throw new Error("stdout is closed");
      },
    };
    const exchange = createFakeExchange();
    exchange.run();

    expect(() => exchange.finish()).not.toThrow();
  });

  // Regression: Express rewrites `req.url` to the router-relative path while
  // dispatching into a mounted router and restores it afterwards. Reading
  // `req.path` at finish time logged "/login" instead of "/api/v1/auth/login".
  // The fake exchange has to mutate its own path to model that.
  it("captures the path before the router rewrites it", () => {
    const exchange = createFakeExchange();
    exchange.run();

    exchange.req.path = "/login";
    exchange.finish();

    expect(lines[0]).toContain('"GET /api/v1/auth/login"');
  });

  it("defaults to stdout when no writer is injected", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const req = { method: "POST", path: "/api/v1/auth/login", ip: "1.1.1.1" };
    const handlers = new Map<string, Handler[]>();
    const res = {
      statusCode: 201,
      writableEnded: true,
      on(event: string, handler: Handler) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return res;
      },
    };

    createRequestLogger()(req as never, res as never, vi.fn() as never);
    (handlers.get("finish") ?? []).forEach((h) => h());

    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[0])).toContain('"POST /api/v1/auth/login"');
    spy.mockRestore();
  });
});
