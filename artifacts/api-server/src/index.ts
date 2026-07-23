import app from "./app";
import { logger } from "./lib/logger";
import { startBookingMaintenanceScheduler } from "./services/booking-maintenance";
import { validateBookingPortalConfiguration } from "./services/booking-access-token";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

validateBookingPortalConfiguration();

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startBookingMaintenanceScheduler();
});
