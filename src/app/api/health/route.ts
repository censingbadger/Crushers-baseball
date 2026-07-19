import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Strip anything that looks like credentials from error text. */
function sanitize(text: string): string {
  return text.replace(/:\/\/[^@\s]+@/g, "://***@");
}

function describe(err: unknown) {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: sanitize(err.message),
      errorStack: sanitize(err.stack ?? "").split("\n").slice(0, 10),
    };
  }
  return { errorMessage: sanitize(String(err)) };
}

/**
 * Deployment diagnostics: reports what the running function can see and
 * whether the database answers — names and booleans only, never values.
 * Everything app-related is imported dynamically inside try/catch, so
 * even a module-load failure produces a readable report instead of a
 * platform crash page.
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

  let dbModule: typeof import("@/db") | null = null;
  try {
    dbModule = await import("@/db");
    report.dbModule = "loaded";
  } catch (err) {
    report.dbModule = "failed to load";
    Object.assign(report, describe(err));
    return NextResponse.json(report, { status: 200 });
  }

  try {
    const { sql } = await import("drizzle-orm");
    const db = await dbModule.getDb();
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(dbModule.tables.users);
    report.db = "ok";
    report.userCount = Number(rows[0]?.n ?? -1);
  } catch (err) {
    report.db = "error";
    Object.assign(report, describe(err));
  }
  return NextResponse.json(report, { status: 200 });
}
