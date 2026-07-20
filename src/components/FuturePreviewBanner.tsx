import { FUTURE_PREVIEW_BLURB, FUTURE_PREVIEW_TITLE } from "@/lib/preview";

/** Amber notice for parked family-facing pages (full) or sections (compact). */
export function FuturePreviewBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="mb-2 inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
        {FUTURE_PREVIEW_TITLE} · not in use yet
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900">
      <p className="text-sm font-extrabold uppercase tracking-wide">
        {FUTURE_PREVIEW_TITLE}
      </p>
      <p className="mt-1 text-sm">{FUTURE_PREVIEW_BLURB}</p>
    </div>
  );
}
