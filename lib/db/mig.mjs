import fs from "node:fs";
import pg from "pg";
const env = Object.fromEntries(
  fs.readFileSync("../../.env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#"))
    .map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1)];})
);
console.log("target host:", new URL(env.DATABASE_URL).host);
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
await client.query("ALTER TABLE excursions ADD COLUMN IF NOT EXISTS subtitle text");
await client.query("ALTER TABLE offers ADD COLUMN IF NOT EXISTS subtitle text");
const r = await client.query("select table_name, column_name from information_schema.columns where column_name='subtitle' and table_name in ('excursions','offers')");
console.log(r.rows);
await client.end();
