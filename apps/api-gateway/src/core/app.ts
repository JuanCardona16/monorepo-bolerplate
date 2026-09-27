import express, { type Express } from "express";
import { CorsConfig, setHeaders } from "../config/index.js";

// Crear una instancia de la aplicación Express
const application: Express = express();

// Configuración
application.use(CorsConfig());
application.use(setHeaders);
application.use(express.json());
application.use(express.urlencoded({ limit: "1mb", extended: true }));

// Configuración
application.disable('x-powered-by');

export default application;