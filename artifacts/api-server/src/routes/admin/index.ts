import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);

export default adminRouter;
