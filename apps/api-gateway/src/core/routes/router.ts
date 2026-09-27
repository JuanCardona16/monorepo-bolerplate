import { Router } from "express";
import { ApiPrefixAuthRoutes } from "../../constants/index.js";
import authenticationPaths from "../../features/authentication/routes/auth.route.js";

const routerApplication: Router = Router();

routerApplication.use(ApiPrefixAuthRoutes, authenticationPaths);

export default routerApplication;
