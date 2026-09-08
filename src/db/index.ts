import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};
const existingPool = globalForDb.__arenaNextJsPostgresqlPool;
export const pool = existingPool ?? new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});
if (!existingPool) {
  // Reuse connections within a warm instance and close idle connections before
  // Fluid compute suspends it. Keep TLS settings from the provider's URL.
  if (process.env.VERCEL) attachDatabasePool(pool);
  pool.on("error", (error) => console.error("Idle database connection error:", error.message));
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}
export const db = drizzle(pool);
