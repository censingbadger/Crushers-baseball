import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { monthLabel } from "@/lib/reports";
import {
  deleteReport,
  publishReport,
  saveReportText,
  unpublishReport,
} from "../actions";

export default async function ReportEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ saved?: string; published?: string }>;
}) {
  await requireCoach();
  const { reportId } = await params;
  const { saved, published } = await searchParams;
  const db = await getDb();
  const [report] = await db
    .select()
    .from(tables.reports)
    .where(eq(tables.reports.id, reportId))
    .limit(1);
  if (!report) notFound();
  const [player] = await db
    .select({ firstName: tables.players.firstName, lastName: tables.players.lastName })
    .from(tables.players)
    .where(eq(tables.players.id, report.playerId))
    .limit(1);
  if (!player) notFound();

  const text = report.finalText ?? report.draftText;
  const isPublished = report.status === "published";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            <Link className="hover:underline" href={`/reports?month=${report.month}`}>
              Monthly reports
            </Link>{" "}
            / {monthLabel(report.month)}
          </p>
          <h1 className="text-2xl font-extrabold">
            {player.firstName} {player.lastName}
          </h1>
          <p className="text-sm text-neutral-600">
            Drafted by{" "}
            {report.draftedBy === "template" ? "the letter template" : report.draftedBy}
            {" · "}
            {isPublished
              ? "published — the family can see this on their Progress page"
              : "draft — the family cannot see this yet"}
          </p>
        </div>
        <span
          className={`chip ${
            isPublished ? "bg-green-600 text-white" : "bg-team-blue-light"
          }`}
        >
          {report.status}
        </span>
      </div>

      {saved && (
        <p className="rounded border border-line bg-team-blue-light px-3 py-1.5 text-sm font-semibold">
          Draft saved — not yet visible to the family.
        </p>
      )}
      {published && (
        <p className="rounded border border-line bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">
          ✓ Published. The family sees it on their Progress page.
        </p>
      )}

      {isPublished ? (
        <>
          <section className="card whitespace-pre-wrap p-5 text-[15px] leading-relaxed">
            {text}
          </section>
          <form action={unpublishReport}>
            <input type="hidden" name="reportId" value={report.id} />
            <button className="btn text-sm" type="submit">
              Unpublish to edit
            </button>
          </form>
        </>
      ) : (
        <form className="space-y-3">
          <input type="hidden" name="reportId" value={report.id} />
          <textarea
            className="field min-h-[420px] w-full font-mono text-sm leading-relaxed"
            name="finalText"
            defaultValue={text}
            required
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn text-sm" formAction={saveReportText} type="submit">
              Save draft
            </button>
            <button
              className="btn btn-primary text-sm"
              formAction={publishReport}
              type="submit"
            >
              Approve & publish to family
            </button>
            <button
              className="ml-auto text-xs text-red-700 underline"
              formAction={deleteReport}
              formNoValidate
              type="submit"
            >
              delete draft
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
