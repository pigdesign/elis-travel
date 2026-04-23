import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);
adminRouter.use(leadsRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(customersRouter);

export default adminRouter;
