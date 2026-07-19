import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, tables } from "@/db";

export const dynamic = "force-dynamic";

/** Strip anything that looks like credentials from error text. */
function sanitize(text: string): string {
  return text.replace(/:\/\/[^@\s]+@/g, "://***@");
}

/**
 * Deployment diagnostics: reports which configuration is visible to the
 * running function and whether the database answers — names and booleans
 * only, never values. Public by design; it exposes nothing sensitive.
 */
export async function GET() {
  const report: Record<string, unknown> = {
    node: process.version,
    onNetlify: Boolean(process.env.NETLIFY),
    hasNetlifyDbUrl: Boolean(process.env.NETLIFY_DATABASE_URL),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    cwd: process.cwd(),
    drizzleFolderPresent: existsSync(path.join(process.cwd(), "drizzle")),
  };
  try {
    const db = await getDb();
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(tables.users);
    report.db = "ok";
    report.userCount = Number(rows[0]?.n ?? -1);
  } catch (err) {
    report.db = "error";
    if (err instanceof Error) {
      report.errorName = err.name;
      report.errorMessage = sanitize(err.message);
      report.errorStack = sanitize(err.stack ?? "")
        .split("\n")
        .slice(0, 8);
    } else {
      report.errorMessage = sanitize(String(err));
    }
  }
  return NextResponse.json(report);
}
