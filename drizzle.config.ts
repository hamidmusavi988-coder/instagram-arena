import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Environment variables supplied by the host take priority. Locally, use
// .env.local before the sandbox's .env so a pulled Neon URL is respected.
config({ path: [".env.local", ".env"], quiet: true });
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL (and optionally DATABASE_URL_UNPOOLED) before running Drizzle.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  strict: true,
});
