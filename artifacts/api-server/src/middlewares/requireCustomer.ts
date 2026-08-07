import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { customerAccountsTable, type CustomerAccount } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customerAccount?: CustomerAccount;
    }
  }
}

/**
 * Guardia dell'area clienti.
 *
 * Due proprieta non negoziabili:
 *
 * 1. NON accetta una sessione admin. Le due sessioni vivono su cookie e store
 *    distinti (vedi app.ts) e non devono mai fare da ripiego l'una per l'altra:
 *    un fallback implicito qui sarebbe una confusione di privilegi.
 *
 * 2. Rilegge SEMPRE lo stato dell'account dal database. La sessione cliente dura
 *    90 giorni: fidarsi di quanto vi e scritto significherebbe che il blocco di
 *    un account dal backoffice non ha effetto per tre mesi. E una SELECT su
 *    chiave primaria, il costo e trascurabile; senza, il blocco e decorativo.
 */
export async function requireCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const claim = req.session?.customerAccount;
  if (!claim?.accountId) {
    res.status(401).json({ error: "Accesso richiesto." });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, claim.accountId))
    .limit(1);

  if (!account || account.status !== "active") {
    // L'account e stato bloccato o cancellato dopo l'accesso: la sessione non
    // deve sopravvivergli.
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Sessione non piu valida." });
    return;
  }

  req.customerAccount = account;
  next();
}
