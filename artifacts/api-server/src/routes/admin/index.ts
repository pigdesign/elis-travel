import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);
adminRouter.use(leadsRouter);
adminRouter.use(dashboardRouter);

export default adminRouter;
