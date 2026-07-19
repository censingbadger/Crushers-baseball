"use client";

import { useState, useTransition } from "react";
import {
  addCoach,
  addFamilyMember,
  generateFamilyLogins,
  resetFamilyPassword,
  type IssuedCredential,
} from "./actions";

export function CredsPanel({ pendingCount }: { pendingCount: number }) {
  const [creds, setCreds] = useState<IssuedCredential[]>([]);
  const [pending, startTransition] = useTransition();

  const download = () => {
    const lines = [
      "Crushers Blue — family logins",
      "Site: your team site URL",
      "",
      ...creds.map(
        (c) =>
          `${c.family}${c.players ? ` (${c.players})` : ""}\n  email:    ${c.email}\n  password: ${c.password}\n`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "crushers-family-logins.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={pending || pendingCount === 0}
          onClick={() =>
            startTransition(async () => {
              const issued = await generateFamilyLogins();
              setCreds((prev) => [...prev, ...issued]);
            })
          }
        >
          {pending
            ? "Creating…"
            : pendingCount === 0
              ? "All families have logins"
              : `Generate ${pendingCount} family login${pendingCount === 1 ? "" : "s"}`}
        </button>
        {creds.length > 0 && (
          <button className="btn" onClick={download}>
            ⬇ Download credentials (.txt)
          </button>
        )}
      </div>

      {creds.length > 0 && (
        <div className="rounded-xl border-2 border-team-orange bg-paper p-3">
          <p className="mb-2 text-sm font-bold text-team-orange-dark">
            Shown once — download or copy these now. Only scrambled versions
            are stored.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th className="py-1 pr-2">Family</th>
                <th className="py-1 pr-2">Email</th>
                <th className="py-1">Password</th>
              </tr>
            </thead>
            <tbody>
              {creds.map((c) => (
                <tr key={c.email} className="border-b border-line" data-testid="family-cred">
                  <td className="py-1 pr-2 font-semibold">
                    {c.family}
                    {c.players && (
                      <span className="ml-1 text-xs text-neutral-500">({c.players})</span>
                    )}
                  </td>
                  <td className="py-1 pr-2" data-testid="cred-email">{c.email}</td>
                  <td className="py-1 font-mono font-bold" data-testid="cred-password">
                    {c.password}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ResetButton({ userId, family }: { userId: string; family: string }) {
  const [cred, setCred] = useState<IssuedCredential | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="text-xs text-team-blue-dark underline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setCred(await resetFamilyPassword(userId));
          })
        }
        title={`Reset ${family}'s password`}
      >
        {pending ? "resetting…" : "reset password"}
      </button>
      {cred && (
        <span className="rounded border border-team-orange bg-paper px-1.5 py-0.5 font-mono text-xs font-bold">
          {cred.password}
        </span>
      )}
    </span>
  );
}

export function AddFamilyForm({
  players,
}: {
  players: { id: string; name: string }[];
}) {
  const [cred, setCred] = useState<IssuedCredential | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          e.currentTarget.reset();
          startTransition(async () => {
            const result = await addFamilyMember(fd);
            setCred(result);
            setFailed(result === null);
          });
        }}
      >
        <div>
          <label className="label" htmlFor="fam-first">First name</label>
          <input className="field" id="fam-first" name="firstName" required />
        </div>
        <div>
          <label className="label" htmlFor="fam-last">Last name</label>
          <input className="field" id="fam-last" name="lastName" required />
        </div>
        <div>
          <label className="label" htmlFor="fam-email">Email</label>
          <input className="field" id="fam-email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="fam-player">Their player</label>
          <select className="field" id="fam-player" name="playerId" defaultValue="">
            <option value="">— link later —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={pending} type="submit">
          {pending ? "Adding…" : "Add family member"}
        </button>
      </form>
      {failed && (
        <p className="text-sm font-semibold text-red-700">
          Couldn&apos;t add — check the fields, and make sure that email
          isn&apos;t already in use.
        </p>
      )}
      {cred && (
        <p className="rounded border-2 border-team-orange bg-paper px-3 py-2 text-sm">
          <span className="font-bold">{cred.family}</span> can now sign in —{" "}
          {cred.email} /{" "}
          <span className="font-mono font-bold" data-testid="new-member-password">
            {cred.password}
          </span>{" "}
          <span className="text-xs text-neutral-500">(shown once)</span>
        </p>
      )}
    </div>
  );
}

export function AddCoachForm() {
  const [cred, setCred] = useState<IssuedCredential | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setCred(await addCoach(fd));
        });
        e.currentTarget.reset();
      }}
    >
      <div>
        <label className="label" htmlFor="coach-name">Name</label>
        <input className="field" id="coach-name" name="name" required />
      </div>
      <div>
        <label className="label" htmlFor="coach-email">Email</label>
        <input className="field" id="coach-email" name="email" type="email" required />
      </div>
      <button className="btn btn-blue" disabled={pending} type="submit">
        {pending ? "Adding…" : "Add coach"}
      </button>
      {cred && (
        <span className="rounded border border-team-orange bg-paper px-2 py-1 text-sm">
          {cred.family}: <span className="font-mono font-bold">{cred.password}</span>{" "}
          <span className="text-xs text-neutral-500">(shown once)</span>
        </span>
      )}
    </form>
  );
}
