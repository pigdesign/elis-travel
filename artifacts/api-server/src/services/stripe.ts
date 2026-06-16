import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.warn("[stripe] STRIPE_SECRET_KEY non impostata — pagamenti disabilitati.");
}

export const stripe = key
  ? new Stripe(key, { apiVersion: "2026-05-27.dahlia" })
  : null;
