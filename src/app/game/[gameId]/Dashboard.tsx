"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPitches,
  applySuggestedBattingOrder,
  autoArrangeField,
  addPlayerToGame,
  moveGamePlayer,
  planFullGame,
  setInning,
  setUpSpot,
  swapBattingSpot,
} from "@/app/game/actions";
import { BENCH } from "@/lib/gameday";
import { relTime } from "@/lib/format";
import { roleWeights, type LineupMode, type RolesByPlayer } from "@/lib/depth";
import { auditLineup, gapFillOptions, positionDepth, type Move } from "@/lib/recommend";

const POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"] as const;

// Chip anchors in percent of the 4:3 field, matching the SVG geometry
// below (home plate at (50,68) in a 100x75 viewBox).
const SLOT_POS: Record<string, { top: string; left: string }> = {
  CF: { top: "17%", left: "50%" },
  LF: { top: "26%", left: "25%" },
  RF: { top: "26%", left: "75%" },
  SS: { top: "44%", left: "37%" },
  "2B": { top: "44%", left: "63%" },
  "3B": { top: "60%", left: "27%" },
  "1B": { top: "60%", left: "73%" },
  P: { top: "62%", left: "50%" },
  C: { top: "87%", left: "50%" },
};

function FieldArt() {
  return (
    <svg
      viewBox="0 0 100 75"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {/* foul ground */}
      <rect width="100" height="75" fill="#2f7a3d" />
      {/* fair territory fan */}
      <path
        d="M 50 68 L 10.4 28.4 A 56 56 0 0 1 89.6 28.4 Z"
        fill="#43974f"
      />
      {/* mowing rings */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="7">
        <path d="M 21.7 39.7 A 40 40 0 0 1 78.3 39.7" />
        <path d="M 31.6 49.6 A 26 26 0 0 1 68.4 49.6" />
      </g>
      {/* outfield fence with foul poles */}
      <path
        d="M 10.4 28.4 A 56 56 0 0 1 89.6 28.4"
        fill="none"
        stroke="#f5efe0"
        strokeWidth="1.1"
      />
      <circle cx="10.4" cy="28.4" r="1" fill="#ffd23f" />
      <circle cx="89.6" cy="28.4" r="1" fill="#ffd23f" />
      {/* infield dirt */}
      <path
        d="M 50 69.5 L 72.5 47 L 50 24.5 L 27.5 47 Z"
        fill="#c99054"
        stroke="#b57e42"
        strokeWidth="0.4"
      />
      {/* infield grass */}
      <path d="M 50 61.5 L 64.5 47 L 50 32.5 L 35.5 47 Z" fill="#43974f" />
      {/* base cutouts */}
      <circle cx="71" cy="47" r="3" fill="#c99054" />
      <circle cx="29" cy="47" r="3" fill="#c99054" />
      <circle cx="50" cy="26" r="3" fill="#c99054" />
      {/* mound + home circle */}
      <circle cx="50" cy="47" r="3.6" fill="#c99054" />
      <rect x="48.9" y="46.7" width="2.2" height="0.7" rx="0.2" fill="#ffffff" />
      <circle cx="50" cy="68" r="5.2" fill="#c99054" />
      {/* foul lines */}
      <g stroke="#ffffff" strokeWidth="0.6">
        <line x1="50" y1="68" x2="10.4" y2="28.4" />
        <line x1="50" y1="68" x2="89.6" y2="28.4" />
      </g>
      {/* bases */}
      <g fill="#ffffff" stroke="#1e1b1b" strokeWidth="0.25">
        <rect x="69.6" y="45.6" width="2.8" height="2.8" transform="rotate(45 71 47)" />
        <rect x="27.6" y="45.6" width="2.8" height="2.8" transform="rotate(45 29 47)" />
        <rect x="48.6" y="24.6" width="2.8" height="2.8" transform="rotate(45 50 26)" />
        {/* home plate */}
        <path d="M 48.7 66.6 h 2.6 v 1.5 l -1.3 1.2 l -1.3 -1.2 Z" />
      </g>
    </svg>
  );
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  game: {
    id: string;
    label: string;
    opponent: string | null;
    status: "setup" | "live" | "final";
    innings: number;
    clockMinutes: number;
    startedAtMs: number | null;
    currentInning: number;
    outs: number;
    upSpot: number;
  };
  players: Player[];
  /** playerId -> slot for the current inning */
  current: Record<string, string>;
  benchInningsByPlayer: Record<string, number>;
  pitchInningsByPlayer: Record<string, number>;
  gamePitchesByPlayer: Record<string, number>;
  eligibility: Record<string, { eligible: boolean; remaining: number; reason: string | null }>;
  ratingsByPlayer: Record<string, Record<string, number>>;
  /** The staff's shared depth-chart roles (playerId -> position -> role). */
  rolesByPlayer: RolesByPlayer;
  /** playerId -> positions the kid's aspirations name (e.g. ["SS","P"]). */
  aspiringByPlayer: Record<string, string[]>;
  /** playerId -> season bench share (0..1) — the fairness number. */
  seasonSatShareByPlayer: Record<string, number>;
  /** inning -> playerId currently at P, prefilling the pitching plan. */
  pitcherByInning: Record<number, string>;
  /** Roster kids not in this game (practice squad, RSVP no) — addable. */
  addablePlayers: { id: string; name: string; practice: boolean }[];
  score: { inning: number; side: "us" | "them"; runs: number }[];
  battingOrder: { playerId: string; spot: number }[];
  /** The shared-editing trail, newest first — who touched what, when. */
  recentEdits: { id: string; section: string; summary: string; actor: string; atMs: number }[];
  /** The signed-in coach's initials — "You" in the trail, flash filter. */
  myInitials: string;
}

export function Dashboard(props: Props) {
  const { game, players, current, eligibility } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ playerId: string; target: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Dugout-board mode: the player-safe view — just the field and the
  // batting order, no ratings, suggestions, or pitch numbers on display.
  const [board, setBoard] = useState(false);
  // Game context: "compete" ranks by role & ability for a close game;
  // "develop" hands the develop spots and the kids' ★ picks the reps.
  const [mode, setMode] = useState<LineupMode>("compete");
  // The board's "who's up" pointer — optimistic locally, server-synced so
  // every device in the dugout shows the same batter.
  const [upSpot, setUpSpotLocal] = useState(game.upSpot);
  useEffect(() => setUpSpotLocal(game.upSpot), [game.upSpot]);
  // Pitch counts, optimistic: +1/+5 is the app's most-repeated tap, eyes on
  // the mound — the number must move instantly, not wait for the route
  // refetch. Re-synced to the server total (which folds in other coaches'
  // taps) whenever the values actually change, so counts never drift or
  // double. Keyed on a value hash, not object identity, or the pending
  // re-render would clobber the optimistic bump before the server responds.
  const [localPitches, setLocalPitches] = useState<Record<string, number>>(
    props.gamePitchesByPlayer,
  );
  const pitchesKey = JSON.stringify(props.gamePitchesByPlayer);
  useEffect(() => {
    setLocalPitches(props.gamePitchesByPlayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchesKey]);
  const pitchesOf = (pid: string) => localPitches[pid] ?? 0;
  function bumpPitch(pid: string, delta: number) {
    setLocalPitches((m) => ({ ...m, [pid]: Math.max(0, (m[pid] ?? 0) + delta) }));
    startTransition(async () => {
      await addPitches(game.id, pid, delta);
      router.refresh();
    });
  }
  // Pitching plan, prefilled from each inning's current pitcher.
  const [plan, setPlan] = useState<(string | null)[]>(() =>
    Array.from({ length: game.innings }, (_, i) => props.pitcherByInning[i + 1] ?? null),
  );
  // The slot a move just vacated — the assist island leads with it.
  const [focusGap, setFocusGap] = useState<string | null>(null);
  // The slot a move just filled — the island shows its depth chart.
  const [focusSlot, setFocusSlot] = useState<string | null>(null);
  // Reasoning lines from the last generated batting order.
  const [orderNotes, setOrderNotes] = useState<string[] | null>(null);
  // Drag state: press a chip (long-press on touch, click-hold on mouse),
  // pull it over a slot or the bench, release to drop.
  const [drag, setDrag] = useState<{ pid: string; x: number; y: number; armed: boolean } | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  // Window-level pointer handlers bind once per drag; they read the live
  // drag state through this ref instead of a stale closure.
  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Keep other devices in sync: refresh server state every 15s.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  // When a refresh brings in ANOTHER coach's edit, flash the trail strip
  // for a few seconds — the "someone else just changed something" cue.
  const latestEdit = props.recentEdits[0] ?? null;
  const [remoteFlash, setRemoteFlash] = useState(false);
  const seenEditId = useRef(latestEdit?.id ?? null);
  useEffect(() => {
    if (!latestEdit || seenEditId.current === latestEdit.id) return;
    seenEditId.current = latestEdit.id;
    if (latestEdit.actor === props.myInitials) return;
    setRemoteFlash(true);
    const t = window.setTimeout(() => setRemoteFlash(false), 6000);
    return () => window.clearTimeout(t);
  }, [latestEdit, props.myInitials]);
  const editWho = (actor: string) => (actor === props.myInitials ? "You" : actor);

  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, `${p.firstName} ${p.lastName.slice(0, 1)}.`]));
    return (id: string) => m.get(id) ?? "?";
  }, [players]);

  const playerAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const [pid, slot] of Object.entries(current)) m.set(slot, pid);
    return m;
  }, [current]);

  const benchIds = useMemo(
    () =>
      Object.entries(current)
        .filter(([, slot]) => slot === BENCH)
        .map(([pid]) => pid)
        .sort((a, b) => (props.benchInningsByPlayer[b] ?? 0) - (props.benchInningsByPlayer[a] ?? 0)),
    [current, props.benchInningsByPlayer],
  );

  async function doMove(playerId: string, target: string, force = false) {
    setBusy(true);
    // Compute before the write: does this move leave a hole behind?
    const from = current[playerId] ?? BENCH;
    const occupant = target !== BENCH ? (playerAt.get(target) ?? null) : null;
    const result = await moveGamePlayer(game.id, playerId, target as never, force);
    setBusy(false);
    if (!result.ok && result.warning) {
      setWarning({ playerId, target, text: result.warning });
      return;
    }
    setWarning(null);
    setSelected(null);
    setFocusGap(from !== BENCH && from !== target && !occupant ? from : null);
    setFocusSlot(target !== BENCH && target !== from ? target : null);
    startTransition(() => router.refresh());
  }

  /** Apply a suggestion: its moves in order (a shift is move + backfill). */
  async function applyMoves(moves: Move[]) {
    for (const m of moves) {
      await doMove(m.playerId, m.target);
    }
    setFocusGap(null);
  }

  // ---- drag & drop (pointer events: mouse + touch share one path) ----

  function chipPointerDown(e: React.PointerEvent, pid: string) {
    if (busy || game.status === "final") return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDrag({ pid, x: e.clientX, y: e.clientY, armed: false });
    if (e.pointerType !== "mouse") {
      // Long-press arms the drag on touch; a quick tap stays a tap.
      holdTimer.current = window.setTimeout(() => {
        setDrag((d) => (d ? { ...d, armed: true } : d));
      }, 260);
    }
  }

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      setDrag((d) => {
        if (!d) return d;
        const armed = d.armed || dist > 6;
        return { ...d, x: e.clientX, y: e.clientY, armed };
      });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setDropHover(el?.closest("[data-drop]")?.getAttribute("data-drop") ?? null);
    };
    const finish = (e: PointerEvent) => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      const d = dragRef.current;
      setDrag(null);
      setDropHover(null);
      dragStart.current = null;
      if (!d?.armed) return; // plain tap — the chip's onClick handles it
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 250);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-drop]")?.getAttribute("data-drop");
      if (target && target !== (current[d.pid] ?? BENCH)) {
        void doMove(d.pid, target);
      }
    };
    const cancel = () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      setDrag(null);
      setDropHover(null);
      dragStart.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, current]);

  function tapSlot(slot: string) {
    if (busy) return;
    const occupant = playerAt.get(slot) ?? null;
    if (selected) {
      if (occupant === selected) {
        setSelected(null);
        return;
      }
      void doMove(selected, slot);
      return;
    }
    if (occupant) setSelected(occupant);
  }

  function tapBenchPlayer(pid: string) {
    if (busy) return;
    setSelected(selected === pid ? null : pid);
  }

  // ---- the assist island's brain: gaps + audit, recomputed per state ----
  const emptySlots = useMemo(
    () => POSITIONS.filter((p) => !playerAt.get(p)),
    [playerAt],
  );
  const orderedGaps = useMemo(
    () =>
      focusGap && emptySlots.includes(focusGap as (typeof POSITIONS)[number])
        ? [focusGap, ...emptySlots.filter((s) => s !== focusGap)]
        : [...emptySlots],
    [emptySlots, focusGap],
  );
  // Role-aware decision weights: suggestions rank on ability × role for
  // the current mode; the numbers shown stay raw ratings.
  const weights = useMemo(
    () =>
      roleWeights(
        players.map((p) => p.id),
        props.ratingsByPlayer,
        props.rolesByPlayer,
        mode,
        props.aspiringByPlayer,
      ),
    [players, props.ratingsByPlayer, props.rolesByPlayer, mode, props.aspiringByPlayer],
  );
  const gapOptions = useMemo(
    () =>
      new Map(
        orderedGaps.map((slot) => [
          slot,
          gapFillOptions(slot, current, props.ratingsByPlayer, weights),
        ]),
      ),
    [orderedGaps, current, props.ratingsByPlayer, weights],
  );
  const audit = useMemo(
    () =>
      auditLineup(current, props.ratingsByPlayer, props.benchInningsByPlayer, weights).filter(
        (s) => s.kind !== "gap", // gaps get their richer treatment above
      ),
    [current, props.ratingsByPlayer, props.benchInningsByPlayer, weights],
  );

  const ratingChip = (pid: string, slot: string) =>
    props.ratingsByPlayer[pid]?.[slot] ?? 1;

  // Depth chart the island leads with: the slot of the selected fielder,
  // or the one a move just filled.
  const depthSlot =
    (selected && current[selected] !== BENCH ? current[selected] : null) ?? focusSlot;
  const depth = useMemo(
    () =>
      depthSlot
        ? positionDepth(
            depthSlot,
            current,
            props.ratingsByPlayer,
            props.aspiringByPlayer,
            4,
            weights,
            props.rolesByPlayer,
          )
        : [],
    [depthSlot, current, props.ratingsByPlayer, props.aspiringByPlayer, weights, props.rolesByPlayer],
  );

  const roleAt = (pid: string, slot: string): string | undefined =>
    (props.rolesByPlayer[pid] as Record<string, string> | undefined)?.[slot];

  // Arms for the plan's dropdowns: best P-fit first, Pitch Smart status
  // inline so a resting arm is never picked by accident.
  const pitcherOptions = useMemo(
    () =>
      players
        .map((p) => {
          const rating = props.ratingsByPlayer[p.id]?.P;
          const role = roleAt(p.id, "P");
          const resting = !eligibility[p.id]?.eligible;
          const mult =
            role === "primary" ? 1.25 : role === "secondary" ? 1.1 : role === "never" ? 0 : 1;
          return {
            id: p.id,
            sort: (rating ?? 1) * mult - (resting ? 100 : 0),
            label: `${nameOf(p.id)} · P ${rating ?? "·"}${role ? ` (${role})` : ""}${resting ? " 🚫 resting" : ""}`,
          };
        })
        .sort((a, b) => b.sort - a.sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, props.ratingsByPlayer, props.rolesByPlayer, eligibility, nameOf],
  );

  // Gray ghost on an empty slot: the best one-move (bench) fill.
  const ghostFor = (slot: string) =>
    gapOptions.get(slot)?.find((o) => o.kind === "bench") ?? null;

  const pitcherId = playerAt.get("P") ?? null;

  return (
    <div className="space-y-3">
      {/* Top strip: inning stepper + tools. No score, no clock, no outs —
          GameChanger records the game; this board plans and runs it. */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <button
            className="btn px-3 py-1.5"
            onClick={() => startTransition(async () => { await setInning(game.id, game.currentInning - 1); router.refresh(); })}
            disabled={pending || game.currentInning <= 1}
          >
            ◀
          </button>
          <span className="min-w-16 text-center text-lg font-extrabold">
            Inn {game.currentInning}
            {game.currentInning > game.innings && (
              <span className="ml-1 align-middle text-[11px] font-bold uppercase text-team-orange-dark">extra</span>
            )}
          </span>
          <button
            className="btn px-3 py-1.5"
            onClick={() => startTransition(async () => { await setInning(game.id, game.currentInning + 1); router.refresh(); })}
            disabled={pending || game.currentInning >= 9}
          >
            ▶
          </button>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {!board && (
            <span
              className="flex overflow-hidden rounded-lg border border-line text-xs font-bold"
              title="Close game: strongest arrangement by role and ability. Up big: develop spots and the kids' ★ picks get the reps."
              data-testid="mode-toggle"
            >
              <button
                className={`px-2.5 py-1.5 ${mode === "compete" ? "bg-team-blue" : "bg-paper text-neutral-500"}`}
                onClick={() => setMode("compete")}
              >
                Close game
              </button>
              <button
                className={`px-2.5 py-1.5 ${mode === "develop" ? "bg-team-orange" : "bg-paper text-neutral-500"}`}
                onClick={() => setMode("develop")}
              >
                Up big
              </button>
            </span>
          )}
          {!board && (
            <button
              className="btn text-sm"
              disabled={pending || busy}
              onClick={() => {
                const ask =
                  mode === "compete"
                    ? "Auto-arrange the strongest field for each inning from here on? Planned pitchers stay on the mound; everyone else is rearranged, and you can still drag anyone after."
                    : "Auto-arrange for development? Planned pitchers stay on the mound; develop spots and ★ picks get the field. You can still drag anyone after.";
                if (!window.confirm(ask)) return;
                startTransition(async () => {
                  await autoArrangeField(game.id, mode);
                  router.refresh();
                });
              }}
            >
              ⚡ Auto-arrange
            </button>
          )}
          <button className="btn text-sm" onClick={() => setBoard(!board)}>
            {board ? "← Coach view" : "▦ Dugout board"}
          </button>
        </span>
      </div>

      {/* The shared-editing trail: three coaches can run this game at
          once, and this strip says whose change you're looking at. It
          flashes when a sync pulls in someone else's edit. Coach view
          only — the dugout board stays clean for player eyes. */}
      {!board && latestEdit && (
        <details
          data-testid="edit-log"
          className={`rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs transition-shadow ${
            remoteFlash ? "ring-2 ring-amber-400" : ""
          }`}
        >
          <summary className="cursor-pointer font-semibold text-neutral-600">
            ✎ <b>{editWho(latestEdit.actor)}</b> · {latestEdit.summary} ·{" "}
            <span suppressHydrationWarning>{relTime(latestEdit.atMs, Date.now())}</span>
            {remoteFlash && (
              <span className="ml-1.5 rounded bg-amber-300 px-1 py-0.5 font-bold uppercase">
                just updated
              </span>
            )}
          </summary>
          <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
            {props.recentEdits.map((e) => (
              <li key={e.id} className="font-semibold text-neutral-600">
                <b>{editWho(e.actor)}</b> {e.summary}
                <span suppressHydrationWarning className="text-neutral-400">
                  {" "}· {relTime(e.atMs, Date.now())}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {warning && (
        <div className="card border-red-700 bg-amber-50 p-3">
          <p className="text-sm font-bold text-red-700">⚠ {warning.text}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn text-xs" onClick={() => setWarning(null)}>
              Cancel
            </button>
            <button
              className="btn bg-red-700 text-xs text-paper"
              onClick={() => void doMove(warning.playerId, warning.target, true)}
            >
              Override anyway
            </button>
          </div>
        </div>
      )}

      <div
        className={
          board
            ? "grid gap-3 lg:grid-cols-[1fr_300px] lg:items-start"
            : "grid gap-3 lg:grid-cols-[1fr_260px]"
        }
      >
        {/* Field */}
        <div>
          {/* Board mode caps the diamond by viewport height so field +
              batting order share one iPad-landscape screen, no scrolling. */}
          <div
            className={`relative aspect-[4/3] overflow-hidden rounded-xl border border-line ${
              board ? "mx-auto lg:max-w-[calc((100vh-240px)*1.3333)]" : ""
            }`}
          >
            <FieldArt />
            {POSITIONS.map((pos) => {
              const pid = playerAt.get(pos) ?? null;
              const sel = pid !== null && pid === selected;
              const empty = pid === null;
              const dragged = drag?.armed && pid !== null && drag.pid === pid;
              const hovered = drag?.armed && dropHover === pos;
              return (
                <button
                  key={pos}
                  data-drop={pos}
                  aria-label={
                    pid
                      ? `${pos}: ${nameOf(pid)}${
                          pos === "P" && !board ? `, ${pitchesOf(pid)} pitches` : ""
                        }`
                      : `${pos} — empty, tap to place a player`
                  }
                  style={{ ...SLOT_POS[pos], touchAction: "none" }}
                  onPointerDown={pid ? (e) => chipPointerDown(e, pid) : undefined}
                  onClick={() => {
                    if (suppressClick.current) return;
                    tapSlot(pos);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 px-2 py-1 text-center shadow ${
                    sel
                      ? "border-team-orange bg-team-orange text-paper"
                      : empty
                        ? "border-dashed border-white bg-white/20 text-white"
                        : "border-ink bg-paper"
                  } ${selected && !sel ? "ring-2 ring-team-orange" : ""} ${
                    hovered ? "scale-110 ring-4 ring-team-orange" : ""
                  } ${dragged ? "opacity-40" : ""}`}
                >
                  <span className="block text-[11px] font-bold uppercase opacity-70">
                    {pos}
                    {/* While dragging (coach view): the dragged player's fit,
                        or the hard stop when the staff marked "never here". */}
                    {!board &&
                      drag?.armed &&
                      (roleAt(drag.pid, pos) === "never"
                        ? " · 🚫 never"
                        : ` · ${ratingChip(drag.pid, pos)}`)}
                  </span>
                  <span className={`block font-extrabold leading-tight ${board ? "text-base" : "text-sm"}`}>
                    {pid ? nameOf(pid) : "—"}
                  </span>
                  {!board && !pid && !drag?.armed && ghostFor(pos) && (
                    <span className="block text-[11px] font-semibold italic leading-tight opacity-80">
                      {nameOf(ghostFor(pos)!.primaryId)}?
                    </span>
                  )}
                  {pos === "P" && pid && !board && (
                    <span className="block text-[11px] font-semibold">
                      {pitchesOf(pid)} p · {eligibility[pid]?.remaining ?? 0} left
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pitch counter for the current pitcher (coach view only). The
              +1 is the single most-repeated tap in this no-score app —
              big targets, tapped one-handed with eyes on the mound, and
              -1 pushed away so a fat-finger +1 can't decrement. */}
          {pitcherId && !board && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper p-2">
              <span className="text-sm font-bold">
                ⚾ {nameOf(pitcherId)} — {pitchesOf(pitcherId)} pitches
                <span className="ml-1 text-xs font-semibold text-neutral-600">
                  ({eligibility[pitcherId]?.remaining ?? 0} left today)
                </span>
              </span>
              {[1, 5].map((d) => (
                <button
                  key={d}
                  className={`btn h-12 min-w-14 text-lg ${d === 1 ? "btn-primary" : ""}`}
                  aria-label={`Add ${d} pitch${d > 1 ? "es" : ""} for ${nameOf(pitcherId)}`}
                  onClick={() => bumpPitch(pitcherId, d)}
                >
                  +{d}
                </button>
              ))}
              <button
                className="btn ml-3 h-12 min-w-14 text-lg"
                aria-label={`Subtract a pitch for ${nameOf(pitcherId)}`}
                onClick={() => bumpPitch(pitcherId, -1)}
              >
                −1
              </button>
              {(eligibility[pitcherId]?.remaining ?? 1) <= 10 && (
                <span className="rounded border border-line bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  {eligibility[pitcherId]?.remaining === 0 ? "AT THE CAP" : "NEAR THE CAP"}
                </span>
              )}
            </div>
          )}

        </div>

        {/* Right rail: bench roster, the assist island, batting order */}
        <div className="space-y-3">
          <div
            data-drop={BENCH}
            className={`rounded-lg border border-line bg-paper p-2 ${
              drag?.armed && dropHover === BENCH ? "ring-4 ring-team-orange" : ""
            }`}
          >
            <span className="text-xs font-bold uppercase">Bench</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {benchIds.length === 0 && (
                <span className="text-sm text-neutral-500">Empty — everyone's on the field.</span>
              )}
              {benchIds.map((pid) => (
                <button
                  key={pid}
                  style={{ touchAction: "none" }}
                  aria-label={`${nameOf(pid)} on the bench — tap to select, then tap a position`}
                  onPointerDown={(e) => chipPointerDown(e, pid)}
                  onClick={() => {
                    if (suppressClick.current) return;
                    tapBenchPlayer(pid);
                  }}
                  className={`rounded-lg border-2 px-2 py-1 text-sm font-bold ${
                    selected === pid
                      ? "border-team-orange bg-team-orange text-paper"
                      : "border-ink bg-team-blue-light"
                  } ${drag?.armed && drag.pid === pid ? "opacity-40" : ""}`}
                >
                  {nameOf(pid)}
                  {!board && (
                    <span className="ml-1 text-[11px] font-semibold opacity-70">
                      {props.benchInningsByPlayer[pid] ?? 0} inn sat
                      {props.seasonSatShareByPlayer[pid] !== undefined &&
                        ` · szn ${Math.round(props.seasonSatShareByPlayer[pid] * 100)}%`}
                    </span>
                  )}
                  {!board && !eligibility[pid]?.eligible && (
                    <span title={eligibility[pid]?.reason ?? ""}> 🚫P</span>
                  )}
                </button>
              ))}
              {selected && current[selected] !== BENCH && (
                <button
                  className="rounded-lg border-2 border-dashed border-ink px-2 py-1 text-sm font-bold hover:bg-team-blue-light"
                  onClick={() => void doMove(selected, BENCH)}
                >
                  ⬇ send {nameOf(selected)} to bench
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] font-semibold text-neutral-500">
              {selected
                ? `${nameOf(selected)} selected — tap a position to move, tap again to cancel.`
                : "Drag a player onto the field (hold a beat on phones), or tap to select."}
            </p>
            {/* Kids the seed left out — practice squad stays opt-in. */}
            {!board && props.addablePlayers.length > 0 && (
              <div className="mt-1.5 border-t border-line pt-1.5">
                <span className="text-[11px] font-bold uppercase text-neutral-500">
                  Not in this game
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {props.addablePlayers.map((p) => (
                    <button
                      key={p.id}
                      className="rounded-lg border-2 border-dashed border-line-strong px-2 py-1 text-xs font-bold hover:bg-team-blue-light"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await addPlayerToGame(game.id, p.id);
                          router.refresh();
                        })
                      }
                    >
                      + {p.name}
                      {p.practice && (
                        <span className="ml-1 font-semibold text-neutral-500">practice</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* The pitching-first game plan: declare the arms inning by
              inning, one tap arranges every position around them for the
              whole game. Batting order is never touched. */}
          {!board && (
            <details className="rounded-lg border border-line bg-paper p-2" data-testid="pitch-plan">
              <summary className="cursor-pointer text-xs font-bold uppercase">
                🗓 Pitching plan
              </summary>
              <div className="mt-1.5 space-y-1">
                {Array.from({ length: game.innings }, (_, i) => (
                  <label key={i} className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="w-9 shrink-0">Inn {i + 1}</span>
                    <select
                      className="w-full rounded border border-line px-1 py-1"
                      value={plan[i] ?? ""}
                      onChange={(e) =>
                        setPlan((p) => {
                          const n = [...p];
                          n[i] = e.target.value || null;
                          return n;
                        })
                      }
                    >
                      <option value="">— solver picks —</option>
                      {pitcherOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  className="btn btn-primary mt-1 w-full py-1.5 text-xs"
                  disabled={pending || busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Plan all ${game.innings} innings around these pitchers? Every inning's positions will be rearranged — the batting order stays unchanged.`,
                      )
                    )
                      return;
                    startTransition(async () => {
                      await planFullGame(game.id, plan, mode);
                      router.refresh();
                    });
                  }}
                >
                  ⚡ Plan all {game.innings} innings
                </button>
                <p className="text-[10px] font-semibold text-neutral-500">
                  The solver fills the other eight around each arm and rotates
                  the bench as innings pass. Step through the innings ◀ ▶ to
                  review; drag to fine-tune any of them.
                </p>
              </div>
            </details>
          )}

          {/* The configurator island: gap fills first, then tune-ups.
              Coach view only — the dugout board stays evaluation-free. */}
          {!board && (
          <div className="rounded-lg border border-line bg-paper p-2" data-testid="assist">
            <span className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase">Coach&apos;s assist</span>
              <Link href="/depth" className="text-[11px] font-semibold underline">
                ✎ Depth chart
              </Link>
            </span>
            {depthSlot && depth.length > 0 && (
              <div className="mt-1 rounded bg-team-blue-light/60 p-1.5 text-xs">
                <p className="font-bold">{depthSlot} depth</p>
                {depth.map((d) => (
                  <p
                    key={d.playerId}
                    className={`mt-0.5 font-semibold ${d.holder ? "" : "text-neutral-700"}`}
                  >
                    {d.holder ? "✓ " : ""}
                    {nameOf(d.playerId)} {d.rating}
                    {!d.holder && (
                      <span className="text-neutral-500">
                        {" "}· {d.where === BENCH ? "bench" : d.where}
                      </span>
                    )}
                    {d.role && (
                      <span
                        className={`ml-1 rounded border border-line px-1 text-[10px] font-bold uppercase ${
                          d.role === "never"
                            ? "bg-red-100 text-red-700"
                            : d.role === "primary"
                              ? "bg-team-blue"
                              : "bg-paper"
                        }`}
                      >
                        {d.role}
                      </span>
                    )}
                    {d.aspiring && (
                      <span className="ml-1 rounded bg-amber-300 px-1 text-[10px] font-bold">
                        ★ wants it
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )}
            {orderedGaps.map((slot) => (
              <p
                key={slot}
                className={`mt-1 text-xs font-semibold ${
                  slot === focusGap ? "rounded bg-amber-50 p-1" : ""
                }`}
              >
                <span className="text-red-700">{slot} is empty.</span>
                {(gapOptions.get(slot) ?? []).map((o, i) => (
                  <button
                    key={`${o.primaryId}-${o.kind}`}
                    className="ml-1 underline"
                    onClick={() => void applyMoves(o.moves)}
                  >
                    {i === 0 ? "best: " : ""}
                    {o.kind === "bench"
                      ? `${nameOf(o.primaryId)} (${o.primaryRating})`
                      : `${nameOf(o.primaryId)} over (${o.primaryRating}), ${nameOf(o.backfillId!)} to ${o.backfillSlot} (${o.backfillRating})`}
                  </button>
                ))}
              </p>
            ))}
            {audit.map((s, i) => (
              <p key={i} className="mt-1 text-xs font-semibold">
                {s.kind === "upgrade" && (
                  <>
                    {nameOf(s.detail.bId!)} rates {s.detail.bRating} at {s.slot} —{" "}
                    {nameOf(s.detail.aId!)} is at {s.detail.aRating}.
                    <button className="ml-1 underline" onClick={() => void applyMoves(s.moves)}>
                      Sub in
                    </button>
                  </>
                )}
                {s.kind === "swap" && (
                  <>
                    Swap {nameOf(s.detail.aId!)} ↔ {nameOf(s.detail.bId!)} (
                    {s.detail.aSlot}/{s.detail.bSlot}) — both fit better.
                    <button className="ml-1 underline" onClick={() => void applyMoves(s.moves)}>
                      Swap
                    </button>
                  </>
                )}
                {s.kind === "rest" && (
                  <span className="text-neutral-600">
                    {nameOf(s.detail.aId!)} has sat {s.detail.benchInnings} innings — find a spot
                    soon.
                  </span>
                )}
              </p>
            ))}
            {orderedGaps.length === 0 && audit.length === 0 && (
              <p className="mt-1 text-xs font-semibold text-green-700">
                No changes suggested — this lineup holds up.
              </p>
            )}
          </div>
          )}
          <div className="rounded-lg border border-line bg-paper p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase">Batting order</span>
              <span className="flex items-center gap-1.5">
                {props.battingOrder.length > 0 && (
                  <button
                    className={`btn min-h-[40px] ${board ? "px-4 py-2.5 text-base" : "px-3 py-2 text-sm"}`}
                    disabled={pending}
                    data-testid="next-batter"
                    onClick={() => {
                      const list = props.battingOrder;
                      const idx = list.findIndex((o) => o.spot === upSpot);
                      const next = list[(idx + 1 + list.length) % list.length];
                      setUpSpotLocal(next.spot);
                      startTransition(async () => {
                        await setUpSpot(game.id, next.spot);
                        router.refresh();
                      });
                    }}
                  >
                    Next batter →
                  </button>
                )}
                {!board && (
                  <button
                    className="btn px-2 py-0.5 text-xs"
                    disabled={pending || busy}
                    onClick={() => {
                      if (!window.confirm("Replace the current batting order with a generated one? You can still fine-tune with the arrows.")) return;
                      startTransition(async () => {
                        const res = await applySuggestedBattingOrder(game.id);
                        setOrderNotes(res.notes);
                        router.refresh();
                      });
                    }}
                  >
                    ✨ Suggest order
                  </button>
                )}
              </span>
            </div>
            {!board && orderNotes && (
              <div className="mt-1 rounded bg-team-blue-light/60 p-1.5 text-[11px] font-semibold text-neutral-700">
                {orderNotes.slice(0, 5).map((n) => (
                  <p key={n}>{n}</p>
                ))}
                {orderNotes.length > 5 && <p>… rest by overall quality.</p>}
              </div>
            )}
            <ol className="mt-1 space-y-0.5 text-sm">
              {props.battingOrder.map((o, i) => {
                const n = props.battingOrder.length;
                const upIdx = Math.max(
                  0,
                  props.battingOrder.findIndex((x) => x.spot === upSpot),
                );
                const isUp = i === upIdx;
                const onDeck = n > 1 && i === (upIdx + 1) % n;
                const inHole = n > 2 && i === (upIdx + 2) % n;
                return (
                  <li
                    key={o.playerId}
                    className={`flex items-center gap-1 rounded px-1 ${
                      isUp ? "bg-team-orange/20 ring-1 ring-team-orange" : ""
                    }`}
                  >
                    {/* Tap the batter to mark him up — the dugout's one job. */}
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      data-spot={o.spot}
                      onClick={() => {
                        setUpSpotLocal(o.spot);
                        startTransition(async () => {
                          await setUpSpot(game.id, o.spot);
                          router.refresh();
                        });
                      }}
                    >
                      <span className={`w-5 shrink-0 text-right font-mono text-xs`}>
                        {i + 1}.
                      </span>
                      <span className="truncate font-semibold">
                        {nameOf(o.playerId)}
                      </span>
                      {isUp && (
                        <span className="shrink-0 rounded border border-team-orange-dark bg-team-orange px-1.5 py-0.5 text-[11px] font-extrabold uppercase text-paper">
                          Up
                        </span>
                      )}
                      {onDeck && (
                        <span className="shrink-0 rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          on deck
                        </span>
                      )}
                      {inHole && (
                        <span className="shrink-0 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-500">
                          in the hole
                        </span>
                      )}
                    </button>
                    <span className={`shrink-0 text-neutral-500 text-[11px]`}>
                      {current[o.playerId] === BENCH ? "bench" : current[o.playerId]}
                    </span>
                    {!board && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-line-strong text-base leading-none"
                          aria-label={`Move ${nameOf(o.playerId)} up in the batting order`}
                          onClick={() => startTransition(async () => { await swapBattingSpot(game.id, o.playerId, "up"); router.refresh(); })}
                          disabled={i === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-line-strong text-base leading-none"
                          aria-label={`Move ${nameOf(o.playerId)} down in the batting order`}
                          onClick={() => startTransition(async () => { await swapBattingSpot(game.id, o.playerId, "down"); router.refresh(); })}
                          disabled={i === props.battingOrder.length - 1}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          {!board && (
            <div className="rounded-lg border border-line bg-paper p-2 text-sm">
              <span className="text-xs font-bold uppercase">Innings pitched</span>
              {Object.entries(props.pitchInningsByPlayer)
                .filter(([, n]) => n > 0)
                .map(([pid, n]) => (
                  <p key={pid}>
                    {nameOf(pid)}: <b>{n}</b> inn, {props.gamePitchesByPlayer[pid] ?? 0} pitches
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Drag ghost: follows the pointer while a chip is in flight. */}
      {drag?.armed && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[120%] rounded-lg border-2 border-team-orange bg-paper px-2 py-1 text-sm font-extrabold shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {nameOf(drag.pid)}
        </div>
      )}
    </div>
  );
}
