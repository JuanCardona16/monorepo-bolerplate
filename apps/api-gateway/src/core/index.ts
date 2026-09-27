import { PORT } from "../config/index.js";
import app from "./app.js";

app.listen(PORT, () => {
  console.log(
    `🚀 Servidor REST+WebSocket listening on ${PORT} -> http://localhost:${PORT}`,
  );
  console.log("Control + C por stopping the servive");
})
