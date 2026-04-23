import { Router } from "express";
import { db } from "@workspace/db";
import {
  leadsTable,
  excursionsTable,
  offersTable,
} from "@workspace/db/schema";
import { desc, sql, gte, lte, and, eq } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const todayStr = today.toISOString().slice(0, 10);
    const in30DaysStr = in30Days.toISOString().slice(0, 10);

    const leadsByStatusRows = await db
      .select({
        status: leadsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(leadsTable)
      .groupBy(leadsTable.status);

    const leadsByStatus: Record<string, number> = {
      new: 0,
      contacted: 0,
      quote_sent: 0,
      won: 0,
      lost: 0,
    };
    let leadsTotal = 0;
    for (const row of leadsByStatusRows) {
      leadsByStatus[row.status] = Number(row.count);
      leadsTotal += Number(row.count);
    }

    const [{ count: offersPublished } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offersTable)
      .where(eq(offersTable.status, "published"));

    const upcomingExcursions = await db
      .select({
        id: excursionsTable.id,
        name: excursionsTable.name,
        location: excursionsTable.location,
        date: excursionsTable.date,
        status: excursionsTable.status,
        currentCapacity: excursionsTable.currentCapacity,
        minThreshold: excursionsTable.minThreshold,
        adherentsCount: excursionsTable.adherentsCount,
      })
      .from(excursionsTable)
      .where(
        and(
          gte(excursionsTable.date, todayStr),
          lte(excursionsTable.date, in30DaysStr),
        ),
      )
      .orderBy(excursionsTable.date);

    const recentLeads = await db
      .select({
        id: leadsTable.id,
        customerName: leadsTable.customerName,
        email: leadsTable.email,
        type: leadsTable.type,
        status: leadsTable.status,
        receivedAt: leadsTable.receivedAt,
        offerId: leadsTable.offerId,
        excursionId: leadsTable.excursionId,
        offerName: offersTable.name,
        excursionName: excursionsTable.name,
      })
      .from(leadsTable)
      .leftJoin(offersTable, eq(leadsTable.offerId, offersTable.id))
      .leftJoin(excursionsTable, eq(leadsTable.excursionId, excursionsTable.id))
      .orderBy(desc(leadsTable.receivedAt))
      .limit(5);

    res.set("Cache-Control", "no-store");
    res.json({
      leadsTotal,
      leadsByStatus,
      offersPublished: Number(offersPublished),
      upcomingExcursionsCount: upcomingExcursions.length,
      upcomingExcursions,
      recentLeads,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

export default router;
