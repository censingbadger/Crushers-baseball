// Standalone diagnostics function — deliberately independent of Next.js.
// If the Next server handler is crashing at startup, this still answers at
// /.netlify/functions/probe and reports the runtime environment plus a
// database round-trip, with credentials scrubbed from any error text.

const sanitize = (text: string) => text.replace(/:\/\/[^@\s]+@/g, "://***@");

export default async () => {
  const report: Record<string, unknown> = {
    node: process.version,
    hasNetlifyDbUrl: Boolean(process.env.NETLIFY_DATABASE_URL),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
  };
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
  if (url) {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(url.replace("-pooler.", "."));
      const rows = (await sql`select count(*) as n from users`) as {
        n: string;
      }[];
      report.db = "ok";
      report.userCount = Number(rows[0]?.n ?? -1);
    } catch (err) {
      report.db = "error";
      report.errorMessage =
        err instanceof Error ? sanitize(err.message) : sanitize(String(err));
      report.errorStack =
        err instanceof Error
          ? sanitize(err.stack ?? "").split("\n").slice(0, 8)
          : undefined;
    }
  } else {
    report.db = "no url configured";
  }
  return Response.json(report);
};
