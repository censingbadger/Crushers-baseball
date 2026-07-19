import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

// PGlite gives us a real embedded Postgres persisted to .data/pglite, so dev
// and tests need no external service while the SQL stays hosted-Postgres
// compatible for the Supabase deployment later.
const globalForDb = globalThis as unknown as {
  crushersDb?: Promise<Db>;
};

async function createDb(): Promise<Db> {
  const dataDir =
    process.env.PGLITE_DATA_DIR === "memory"
      ? undefined
      : (process.env.PGLITE_DATA_DIR ??
        path.join(process.cwd(), ".data", "pglite"));
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return db;
}

export function getDb(): Promise<Db> {
  globalForDb.crushersDb ??= createDb();
  return globalForDb.crushersDb;
}

export * as tables from "./schema";
