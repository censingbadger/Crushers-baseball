"use client";

import { useActionState } from "react";
import type { ImportResult } from "./actions";

export function ImportForm({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: (prev: ImportResult | null, formData: FormData) => Promise<ImportResult>;
}) {
  const [result, formAction, pending] = useActionState(action, null);

  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-3 text-xs text-neutral-600">{description}</p>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs text-xs"
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
        />
        <button className="btn btn-primary text-sm" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          {result.summary.map((s, i) => (
            <p key={i} className="font-semibold text-green-800">
              ✓ {s}
            </p>
          ))}
          {result.warnings.length > 0 && (
            <details open={!result.ok} className="rounded border-2 border-ink bg-amber-50 p-2">
              <summary className="cursor-pointer text-xs font-bold uppercase">
                {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 list-inside list-disc text-xs">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {result.credentials && result.credentials.length > 0 && (
            <div className="rounded border-2 border-ink bg-team-blue-light p-2">
              <p className="text-xs font-bold uppercase">
                New parent accounts — share each temp password once, then have
                them change it
              </p>
              <table className="mt-1 text-xs">
                <tbody>
                  {result.credentials.map((c) => (
                    <tr key={c.email}>
                      <td className="pr-3 font-semibold">{c.email}</td>
                      <td className="font-mono">{c.tempPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
