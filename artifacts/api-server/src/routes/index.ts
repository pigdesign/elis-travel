import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import leadsPublicRouter from "./leads-public";
import excursionBookingPublicRouter from "./excursion-booking-public";
import bookingPortalPublicRouter from "./booking-portal-public";
import accountAuthRouter from "./account-auth";
import storageRouter from "./storage";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// Prenotazioni Gite v2: registrato prima del router legacy
router.use(excursionBookingPublicRouter);
router.use(bookingPortalPublicRouter);
// Area clienti: registrato prima del router admin, che monta requireAuth.
router.use(accountAuthRouter);
router.use(leadsPublicRouter);
router.use(storageRouter);
router.use("/admin", requireAuth, adminRouter);

export default router;
