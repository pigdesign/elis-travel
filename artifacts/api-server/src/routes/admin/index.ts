import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import settingsRouter from "./settings";
import pickupLocationsRouter from "./pickup-locations";
import ageRangesRouter from "./age-ranges";
import bookingPaymentsRouter from "./booking-payments";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);
adminRouter.use(leadsRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(customersRouter);
adminRouter.use(settingsRouter);
adminRouter.use(pickupLocationsRouter);
adminRouter.use(ageRangesRouter);
adminRouter.use(bookingPaymentsRouter);

export default adminRouter;
