import { PORT } from "../config/index.js";
import { closeContainer } from "./di/container.js";
import app from "./app.js";

const shutdown = async () => {
  await closeContainer();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen(PORT, () => {
  console.log(
    `🚀 Servidor REST+WebSocket listening on ${PORT} -> http://localhost:${PORT}`,
  );
  console.log("Control + C por stopping the servive");
})
