import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { ACCESS_LOG_IPS, TRUST_PROXY_HOPS } from "../config/env/index.js";
import { CorsConfig } from "../config/index.js";
import { ApiPrefix } from "../constants/index.js";
import { DocsPrefix } from "../constants/docs.js";
import { GlobalHandleError } from "./errors/index.js";
import { createRequestLogger } from "./middleware/logger/requestLogger.js";
import { limiter } from "./middleware/rateLimit/limiter.js";
import { handleNotFound, routerApplication } from "./routes/index.js";
import routerDocs from "./docs/docs.route.js";

// Crear una instancia de la aplicación Express
const application: Express = express();

// Rate limiting keys on the client IP. Behind a reverse proxy every request
// otherwise arrives with the proxy's address and the global 200/15min budget is
// shared by all users, so one busy minute locks everyone out. The hop count is
// configuration, not a constant, because trusting more proxies than actually
// sit in front would let a client forge `X-Forwarded-For` and skip the limit.
if (TRUST_PROXY_HOPS > 0) {
  application.set("trust proxy", TRUST_PROXY_HOPS);
}

// The access log is mounted first, before anything that can answer or reject.
// Mounted after `helmet` or the rate limiter it would miss 429s, and mounted
// after the routes it would miss 404s — and a rejected request is exactly the
// one you want to see.
application.use(createRequestLogger({ includeIp: ACCESS_LOG_IPS }));

application.use(helmet());
application.use(CorsConfig());
application.use(express.json());
application.use(express.urlencoded({ limit: "1mb", extended: true }));
application.use(cookieParser());
application.use(limiter);

// Rutas
// The docs router is a sibling of the business API, not a child: everything
// under `/api/v1` answers with the API response envelope, and the raw OpenAPI
// document does not.
application.use(DocsPrefix, routerDocs);
application.use(ApiPrefix, routerApplication);

// Ruta no encontrada
application.use(handleNotFound);

// Middleware global para el manejo de errores
application.use(GlobalHandleError);

// Configuración
application.disable("x-powered-by");

export default application;
