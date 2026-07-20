"use client";

import { useRef, useState, useTransition } from "react";
import { importGcAuto } from "./actions";
import type { ImportResult } from "@/app/import/actions";

/**
 * The GameChanger portal: one drop zone, any mix of exports. Drag files in
 * (or tap to pick, which is the whole flow on a phone) — the server sniffs
 * batting vs pitching from the headers.
 */
export function GcPortal() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function send(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0 || pending) return;
    const fd = new FormData();
    for (const f of list) fd.append("files", f);
    startTransition(async () => {
      setResult(await importGcAuto(null, fd));
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="card p-4" data-testid="gc-portal">
      <h2 className="text-lg font-bold">GameChanger drop zone</h2>
      <p className="mt-1 text-sm text-neutral-700">
        Batting, pitching, or both at once — the app works out which file is
        which and replaces the previous GameChanger snapshot.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          send(e.dataTransfer.files);
        }}
        className={`mt-3 block w-full rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm font-bold transition ${
          dragOver
            ? "border-team-orange bg-team-blue-light"
            : "border-line-strong bg-paper-tint hover:bg-team-blue-light"
        }`}
      >
        {pending ? "Importing…" : "⚾ Drop GameChanger CSVs here — or tap to choose"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files && send(e.target.files)}
      />
      {result && (
        <div
          className={`mt-3 rounded-lg border p-2 text-sm ${
            result.ok ? "border-green-700 bg-green-50" : "border-amber-500 bg-amber-50"
          }`}
          data-testid="gc-result"
        >
          {result.summary.map((s) => (
            <p key={s} className="font-semibold text-green-800">
              ✓ {s}
            </p>
          ))}
          {result.warnings.map((w) => (
            <p key={w} className="font-semibold text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Where do I get the files from GameChanger?
        </summary>
        <ol className="ml-5 mt-1 list-decimal space-y-1 text-neutral-700">
          <li>
            Sign in at <b>web.gc.com</b> on a computer and open your team.
          </li>
          <li>
            Go to <b>Stats</b>, pick the season view, and use <b>Export</b> to
            download the CSV — once on the batting tab, once on the pitching
            tab.
          </li>
          <li>Drag both files onto the zone above (together is fine).</li>
        </ol>
        <p className="mt-1 text-neutral-700">
          On a phone: export from the GC app via share → save to Files, then
          tap the zone and pick the saved files. Player rows match the roster
          by name, and re-importing always replaces the old snapshot — you can
          do this after every tournament without double counting.
        </p>
      </details>
    </section>
  );
}
