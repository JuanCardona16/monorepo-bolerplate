import type { Server } from "node:http";
import type { Express } from "express";

export interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Boots an Express app on an ephemeral port (0) so suites can exercise the
 * real HTTP stack with the native `fetch` of Node, with no extra dependency.
 * Port 0 lets the OS pick a free port, so suites never collide on a fixed one.
 */
export async function startServer(app: Express): Promise<RunningServer> {
  const server: Server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, () => {
      resolve(started);
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the test server to be listening on a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
