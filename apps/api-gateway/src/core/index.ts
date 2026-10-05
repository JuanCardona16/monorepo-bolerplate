import { PORT } from "../config/index.js";
import { closeContainer, connectDatabase } from "./di/container.js";
import app from "./app.js";

const shutdown = async () => {
  await closeContainer();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function boot(): Promise<void> {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(
      `🚀 Servidor REST+WebSocket listening on ${PORT} -> http://localhost:${PORT}`,
    );
    console.log("Control + C por stopping the servive");
  });
}

boot().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
