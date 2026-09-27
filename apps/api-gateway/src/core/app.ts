import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { CorsConfig } from "../config/index.js";
import { ApiPrefix } from "../constants/index.js";
import { GlobalHandleError } from "./errors/index.js";
import { limiter } from "./middleware/rateLimit/limiter.js";
import { handleNotFound, routerApplication } from "./routes/index.js";

// Crear una instancia de la aplicación Express
const application: Express = express();

application.use(helmet());
application.use(CorsConfig());
application.use(express.json());
application.use(express.urlencoded({ limit: "1mb", extended: true }));
application.use(cookieParser());
application.use(limiter);

// Rutas
application.use(ApiPrefix, routerApplication);

// Ruta no encontrada
application.use(handleNotFound);

// Middleware global para el manejo de errores
application.use(GlobalHandleError);

// Configuración
application.disable("x-powered-by");

export default application;
