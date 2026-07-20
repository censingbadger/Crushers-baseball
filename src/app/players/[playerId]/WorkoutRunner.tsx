"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildWorkout, type WorkoutDrill, type WorkoutSegment } from "@/lib/drills";
import { logWorkout } from "@/app/players/actions";

const QUICK_MINUTES = [10, 15, 20, 30];

function beep(times: number) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      osc.start(t);
      osc.stop(t + 0.22);
    }
  } catch {
    // No audio — the visual handoff still works.
  }
}

const CATEGORY_EMOJI: Record<string, string> = {
  throwing: "💪",
  hitting: "🏏",
  fielding: "🧤",
  pitching: "⚾",
  speed: "⚡",
  fun: "🎉",
};

export function WorkoutRunner({
  playerId,
  firstName,
  drills,
  desiredPositions,
  seed,
}: {
  playerId: string;
  firstName: string;
  drills: WorkoutDrill[];
  desiredPositions: string | null;
  seed: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [plan, setPlan] = useState<WorkoutSegment[]>([]);
  const [segIdx, setSegIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [logged, setLogged] = useState(false);
  const [pending, startTransition] = useTransition();
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Phones open the workout mid-page; snap the timer into view on start.
  useEffect(() => {
    if (phase === "running") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const start = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < 1) return;
    const built = buildWorkout(Math.round(minutes), drills, {
      desiredPositions,
      seed,
    });
    if (built.length === 0) return;
    setPlan(built);
    setSegIdx(0);
    setSecondsLeft(built[0].minutes * 60);
    setPaused(false);
    setLogged(false);
    setPhase("running");
  };

  const finish = (completed: WorkoutSegment[]) => {
    setPhase("done");
    beep(3);
    const total = completed.reduce((sum, s) => sum + s.minutes, 0);
    startTransition(async () => {
      const res = await logWorkout({
        playerId,
        totalMinutes: Math.max(1, total),
        source: "guided",
        segments: completed,
      });
      if (res.ok) {
        setLogged(true);
        router.refresh();
      }
    });
  };

  const advance = () => {
    if (segIdx + 1 < plan.length) {
      beep(2);
      setSegIdx(segIdx + 1);
      setSecondsLeft(plan[segIdx + 1].minutes * 60);
    } else {
      finish(plan);
    }
  };

  useEffect(() => {
    if (phase !== "running" || paused) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, paused, segIdx]);

  useEffect(() => {
    if (phase === "running" && secondsLeft <= 0) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  if (phase === "idle") {
    return (
      <div>
        <p className="mb-2 text-sm font-semibold">
          How much time do you have, {firstName}?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              className="btn btn-primary px-4 py-2 text-base"
              onClick={() => start(m)}
              disabled={drills.length === 0}
            >
              {m} min
            </button>
          ))}
          <input
            className="field w-24"
            placeholder="Other…"
            inputMode="numeric"
            value={customMin}
            onChange={(e) => setCustomMin(e.target.value)}
            aria-label="Custom minutes"
          />
          <button
            className="btn"
            onClick={() => start(Number(customMin))}
            disabled={drills.length === 0}
          >
            Go
          </button>
        </div>
        {drills.length === 0 && (
          <p className="mt-2 text-xs text-neutral-600">
            The coaches haven&apos;t loaded the drill library yet — check back soon.
          </p>
        )}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-1 text-xl font-extrabold">Great work, {firstName}!</p>
        <p className="mt-1 text-sm text-neutral-700">
          {plan.reduce((sum, s) => sum + s.minutes, 0)} minutes in the bank.
          {pending && " Saving…"}
          {logged && " Logged — your effort bar just moved."}
        </p>
        <button className="btn mt-3 text-sm" onClick={() => setPhase("idle")}>
          Another one?
        </button>
      </div>
    );
  }

  const seg = plan[segIdx];
  const mm = Math.floor(Math.max(0, secondsLeft) / 60);
  const ss = String(Math.max(0, secondsLeft) % 60).padStart(2, "0");

  return (
    <div className="text-center" ref={cardRef} style={{ scrollMarginTop: 72 }}>
      <div className="mb-1 flex items-center justify-center gap-1.5">
        {plan.map((s, i) => (
          <span
            key={i}
            title={s.title}
            className={`h-2.5 w-2.5 rounded-full ${
              i < segIdx ? "bg-green-600" : i === segIdx ? "bg-team-orange" : "bg-line-strong"
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
        {segIdx + 1} of {plan.length} · {seg.category}
      </p>
      <p className="mt-1 text-2xl font-extrabold">
        {CATEGORY_EMOJI[seg.category] ?? "⚾"} {seg.title}
      </p>
      <p
        className="mx-auto my-3 text-6xl font-extrabold"
        style={{ fontVariantNumeric: "tabular-nums" }}
        data-testid="workout-timer"
      >
        {mm}:{ss}
      </p>
      <p className="mx-auto max-w-md rounded-xl border-2 border-team-orange bg-paper px-4 py-2 text-lg font-bold text-team-orange-dark">
        💭 {seg.cue}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button className="btn text-sm" onClick={() => setPaused(!paused)}>
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button className="btn text-sm" onClick={advance}>
          ⏭ Done early — next
        </button>
        <button
          className="btn text-sm"
          onClick={() => {
            const done = plan.slice(0, segIdx);
            if (done.length > 0) finish(done);
            else setPhase("idle");
          }}
        >
          ✕ Stop
        </button>
      </div>
    </div>
  );
}
