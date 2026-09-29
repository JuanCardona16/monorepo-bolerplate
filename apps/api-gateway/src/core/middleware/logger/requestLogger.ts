import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Access log: one line per completed request, in the Common Log Format.
 *
 * What it deliberately does NOT log, and why:
 *
 * - **The body.** It carries emails and passwords. A log that persists a
 *   password is a credential store, and it is not safe to fix after the fact.
 * - **The `Authorization` header.** Bearer tokens are credentials.
 * - **The query string.** `?token=`, `?email=`, `?code=` are all common, and
 *   query strings end up in access logs of every proxy in front of the app.
 *   Only `req.path` is logged, never `req.originalUrl`, so a query string
 *   cannot leak by being forgotten here and reintroduced by a refactor.
 * - **The client IP by default.** It is personal data under GDPR. Set
 *   `ACCESS_LOG_IPS=true` only where you actually need it for abuse analysis,
 *   and accept the retention obligation that comes with it.
 *
 * `res.on("close")` also logs, not just `res.on("finish")`. A client that
 * disconnects mid-request never emits `finish`, and those aborted requests are
 * exactly the ones worth knowing about: they are what a slow endpoint or a
 * flaky network looks like from the server side.
 */
export function createRequestLogger(options?: {
  includeIp?: boolean;
  write?: (line: string) => void;
}): RequestHandler {
  const includeIp = options?.includeIp ?? false;
  const write = options?.write ?? ((line: string) => process.stdout.write(`${line}\n`));

  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    let logged = false;

    // Captured NOW, not when the response finishes. Express strips the mount
    // path from `req.url` while it dispatches into a mounted router and
    // restores it afterwards, so by the time `finish` fires `req.path` reads
    // "/login" instead of "/api/v1/auth/login". A log full of router-relative
    // paths is much harder to act on, and a refactor that moves a route would
    // silently rewrite every historical line.
    //
    // `req.path` rather than `req.originalUrl`: this drops the query string,
    // which is the whole point of the no-PII rule.
    const method = req.method;
    const path = req.path;
    const ip = req.ip;

    const log = (aborted: boolean) => {
      // `finish` and `close` can both fire for the same request. Logging twice
      // would double-count every request in the log.
      if (logged) return;
      logged = true;

      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      const line = [
        includeIp ? `${ip} -` : "-",
        `"${method} ${path}"`,
        res.statusCode,
        `${durationMs.toFixed(1)}ms`,
        aborted ? "aborted" : "-",
      ].join(" ");

      // A logging failure must never take down the request it was describing.
      try {
        write(line);
      } catch {
        // Intentionally swallowed: losing a log line is strictly better than
        // turning every request into a 500.
      }
    };

    res.on("finish", () => log(false));
    res.on("close", () => log(!res.writableEnded));

    next();
  };
}
