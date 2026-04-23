import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";
import leadsRouter from "./leads";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);
adminRouter.use(leadsRouter);

export default adminRouter;
