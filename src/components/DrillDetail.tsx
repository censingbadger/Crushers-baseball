import type { HomeworkDrill } from "@/lib/homework";
import { DrillDiagram } from "@/components/DrillDiagram";

// The full "what is this drill" body — shown anywhere a drill name can be
// clicked open (suggestion cards, search hits, the browse list, assigned
// rows). Pure and presentational so it renders in both server and client
// trees. `compact` drops the diagram for dense lists; `children` is an
// assign-button slot rendered at the bottom.

export function DrillDetail({
  drill,
  compact = false,
  children,
}: {
  drill: HomeworkDrill;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p className="font-semibold text-neutral-700">{drill.fixes}</p>
      <p className="rounded bg-team-blue-light/60 px-2 py-1.5 font-bold">
        🗣 The one thought: “{drill.cue}”
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        {drill.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="text-xs font-semibold text-neutral-600">
        <b>How much:</b> {drill.reps} · <b>Gear:</b> {drill.equipment} ·{" "}
        {drill.partner ? "needs a partner" : "solo"}
      </p>
      {drill.safety && (
        <p className="rounded border border-amber-600 bg-amber-50 px-2 py-1.5 text-xs font-semibold">
          ⚠ {drill.safety}
        </p>
      )}
      {!compact && drill.diagram && <DrillDiagram kind={drill.diagram} />}
      <p className="text-xs text-neutral-500">
        Source:{" "}
        <a className="underline" href={drill.source.url} target="_blank" rel="noreferrer">
          {drill.source.name}
        </a>
      </p>
      {children}
    </div>
  );
}

/** The one-line label a drill shows before you open it — reused as a summary. */
export function drillSummaryText(drill: HomeworkDrill): string {
  return `${drill.staple ? "★ " : ""}${drill.title}`;
}
