import { Router } from "express";
import excursionsRouter from "./excursions";

const adminRouter = Router();

adminRouter.use(excursionsRouter);

export default adminRouter;
