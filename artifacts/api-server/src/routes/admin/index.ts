import { Router } from "express";
import excursionsRouter from "./excursions";
import offersRouter from "./offers";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import customerAccountsRouter from "./customer-accounts";
import settingsRouter from "./settings";
import pickupLocationsRouter from "./pickup-locations";
import ageRangesRouter from "./age-ranges";
import bookingPaymentsRouter from "./booking-payments";
import bookingEditsRouter from "./booking-edits";
import emailOutboxRouter from "./email-outbox";
import bookingCancellationsRouter from "./booking-cancellations";
import posterDiagnosticsRouter from "./poster-diagnostics";

const adminRouter = Router();

adminRouter.use(excursionsRouter);
adminRouter.use(offersRouter);
adminRouter.use(leadsRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(customersRouter);
adminRouter.use(customerAccountsRouter);
adminRouter.use(settingsRouter);
adminRouter.use(pickupLocationsRouter);
adminRouter.use(ageRangesRouter);
adminRouter.use(bookingPaymentsRouter);
adminRouter.use(bookingEditsRouter);
adminRouter.use(emailOutboxRouter);
adminRouter.use(bookingCancellationsRouter);
adminRouter.use(posterDiagnosticsRouter);

export default adminRouter;
