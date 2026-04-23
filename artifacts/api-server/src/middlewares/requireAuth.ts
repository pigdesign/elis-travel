import { type Request, type Response, type NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.adminUser) {
    return next();
  }
  res.status(401).json({ error: "Non autorizzato. Effettua il login." });
}
