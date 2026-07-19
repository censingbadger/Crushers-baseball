import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { migrate as migrateNeonHttp } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

// Interchangeable backends, one Postgres dialect:
//  - hosted Postgres (Netlify DB / Neon / Supabase) when a connection URL
//    is present — production. Set DB_HTTP=1 to speak Neon's SQL-over-HTTPS
//    instead of TCP 5432 (for networks where only web traffic is allowed;
//    no interactive transactions, which this app doesn't use).
//  - embedded PGlite persisted to .data/pglite otherwise — dev and tests,
//    no external service needed.
// All drivers expose the identical drizzle pg API, so call sites share the
// PgliteDatabase-shaped type.
export type Db = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  crushersDb?: Promise<Db>;
};

function connectionUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
}

async function createDb(): Promise<Db> {
  const url = connectionUrl();
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (url) {
    // Neon-backed hosts (Netlify DB included) speak SQL over HTTPS, which
    // is the dependable path from serverless functions and restricted
    // networks alike — raw TCP 5432 from a function cold start is not.
    const preferHttp =
      process.env.DB_HTTP === "1" ||
      Boolean(process.env.NETLIFY) ||
      /\.db\.netlify\.com|\.neon\.tech/.test(url);
    if (preferHttp) {
      // The SQL-over-HTTPS endpoint lives on the direct host, not the
      // connection pooler — normalize pooled URLs before deriving it.
      const client = neon(url.replace("-pooler.", "."));
      const db = drizzleNeonHttp(client, { schema });
      // The schema is created/updated by migrations at boot; if the files
      // are unreadable on a hosted bundle, a database that is already
      // migrated must not take the site down.
      try {
        await migrateNeonHttp(db, { migrationsFolder });
      } catch (err) {
        console.error("migration check failed (continuing with existing schema):", err);
      }
      return db as unknown as Db;
    }
    // prepare:false keeps pooled (transaction-mode) URLs happy; max:1 suits
    // serverless function instances.
    const client = postgres(url, { prepare: false, max: 1 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return db as unknown as Db;
  }

  // Serverless filesystems are read-only, so a deploy without a database
  // URL (e.g. a deploy preview whose context lacks NETLIFY_DATABASE_URL)
  // gets an ephemeral in-memory database instead of a crash — it boots to
  // the first-run screen and touches no real data.
  const serverless = Boolean(
    process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT || process.env.VERCEL,
  );
  const dataDir =
    process.env.PGLITE_DATA_DIR === "memory" || serverless
      ? undefined
      : (process.env.PGLITE_DATA_DIR ??
        path.join(process.cwd(), ".data", "pglite"));
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

export function getDb(): Promise<Db> {
  globalForDb.crushersDb ??= createDb();
  return globalForDb.crushersDb;
}

export * as tables from "./schema";
