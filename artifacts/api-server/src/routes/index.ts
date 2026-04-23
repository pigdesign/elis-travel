import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import leadsPublicRouter from "./leads-public";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(leadsPublicRouter);
router.use("/admin", requireAuth, adminRouter);

export default router;
