import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { Position } from "@/db/schema";
import {
  BARS_BY_KEY,
  BARS_SCALE_EXPLANATION,
  barsSummary,
  type BarsKey,
} from "@/lib/bars";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import {
  addBatting,
  addCatching,
  addFielding,
  addPitching,
  battingRates,
  EMPTY_BATTING,
  EMPTY_CATCHING,
  EMPTY_FIELDING,
  EMPTY_PITCHING,
  fieldingRates,
  formatIp,
  pitchingRates,
} from "@/lib/stats";
import { computeSeasonUsage } from "@/lib/usage";

// Everything that reaches the model (or the template) lives in this shape.
// It is assembled from family-shareable data only: first name, the family's
// own goals, shared cues, BARS development levels WITH their behavioral
// anchors, matrix highlights, stat totals, and the player's own playing
// time. Contacts, medical notes, coach-only dev notes, disagreement
// details, and other players' data must never be added here — and no
// composite, percentile, or team comparison exists anywhere, by design.
export interface ReportContext {
  firstName: string;
  monthLabel: string;
  seasonName: string;
  seasonGoals: string | null;
  desiredPositions: string | null;
  /** Blended matrix highlights, strongest first (max 3). */
  topPositions: { position: Position; rating: number }[];
  /**
   * BARS development levels: the staff median per dimension plus the
   * anchor he's at and the next level's anchor — the named next behavior.
   */
  barsLines: {
    code: string;
    label: string;
    level: number;
    anchorNow: string;
    nextTarget: string | null;
  }[];
  /** Shared tendency→cue pairs (already family-visible by design). */
  sharedCues: { category: string; tendency: string; cue: string }[];
  battingLine: string | null;
  pitchingLine: string | null;
  fieldingLine: string | null;
  catchingLine: string | null;
  /** The player's own season playing time — his data, no one else's. */
  playingTimeLine: string | null;
}

// Preferred first — but not every Anthropic plan carries every model, so
// drafting falls through this list on "model not available" errors.
export const REPORT_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const;
export const REPORT_MODEL = REPORT_MODELS[0];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (!y || !m || m < 1 || m > 12) return month;
  return `${names[m - 1]} ${y}`;
}

/** First sentence of an anchor — reports name behaviors, not essays. */
function firstSentence(text: string): string {
  const i = text.indexOf(". ");
  return i === -1 ? text : text.slice(0, i + 1);
}

export async function gatherReportContext(
  seasonId: string,
  playerId: string,
  month: string,
): Promise<ReportContext | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      firstName: tables.players.firstName,
      seasonName: tables.seasons.name,
    })
    .from(tables.rosterEntries)
    .innerJoin(tables.players, eq(tables.rosterEntries.playerId, tables.players.id))
    .innerJoin(tables.seasons, eq(tables.rosterEntries.seasonId, tables.seasons.id))
    .where(
      and(
        eq(tables.rosterEntries.seasonId, seasonId),
        eq(tables.rosterEntries.playerId, playerId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [
    aspirationRows,
    barsRows,
    noteRows,
    matrix,
    battingRows,
    pitchingRows,
    fieldingRows,
    catchingRows,
    seasonGames,
  ] = await Promise.all([
    db
      .select()
      .from(tables.aspirations)
      .where(
        and(
          eq(tables.aspirations.seasonId, seasonId),
          eq(tables.aspirations.playerId, playerId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(tables.barsRatings)
      .where(
        and(
          eq(tables.barsRatings.seasonId, seasonId),
          eq(tables.barsRatings.playerId, playerId),
        ),
      ),
    db
      .select()
      .from(tables.devNotes)
      .where(
        and(
          eq(tables.devNotes.playerId, playerId),
          eq(tables.devNotes.shared, true),
        ),
      )
      .orderBy(asc(tables.devNotes.createdAt)),
    getCurrentRatings(seasonId),
    db
      .select({ line: tables.battingLines })
      .from(tables.battingLines)
      .innerJoin(tables.statGames, eq(tables.battingLines.statGameId, tables.statGames.id))
      .where(
        and(
          eq(tables.statGames.seasonId, seasonId),
          eq(tables.battingLines.playerId, playerId),
        ),
      ),
    db
      .select({ line: tables.pitchingLines })
      .from(tables.pitchingLines)
      .innerJoin(tables.statGames, eq(tables.pitchingLines.statGameId, tables.statGames.id))
      .where(
        and(
          eq(tables.statGames.seasonId, seasonId),
          eq(tables.pitchingLines.playerId, playerId),
        ),
      ),
    db
      .select({ line: tables.fieldingLines })
      .from(tables.fieldingLines)
      .innerJoin(tables.statGames, eq(tables.fieldingLines.statGameId, tables.statGames.id))
      .where(
        and(
          eq(tables.statGames.seasonId, seasonId),
          eq(tables.fieldingLines.playerId, playerId),
        ),
      ),
    db
      .select({ line: tables.catchingLines })
      .from(tables.catchingLines)
      .innerJoin(tables.statGames, eq(tables.catchingLines.statGameId, tables.statGames.id))
      .where(
        and(
          eq(tables.statGames.seasonId, seasonId),
          eq(tables.catchingLines.playerId, playerId),
        ),
      ),
    db.select().from(tables.liveGames).where(eq(tables.liveGames.seasonId, seasonId)),
  ]);

  const aspiration = aspirationRows[0];

  // BARS: staff median per dimension, with the behavior he's at and the
  // next level's behavior as the named target.
  const cells = barsSummary(barsRows).get(playerId) ?? new Map();
  const barsLines: ReportContext["barsLines"] = [];
  for (const [key, cell] of cells) {
    const def = BARS_BY_KEY[key as BarsKey];
    if (!def) continue;
    const now = Math.max(1, Math.min(5, Math.floor(cell.median))) as 1 | 2 | 3 | 4 | 5;
    const next = now < 5 ? ((now + 1) as 1 | 2 | 3 | 4 | 5) : null;
    barsLines.push({
      code: def.code,
      label: def.label,
      level: cell.median,
      anchorNow: firstSentence(def.anchors[now]),
      nextTarget: next ? firstSentence(def.anchors[next]) : null,
    });
  }
  barsLines.sort((a, b) => a.code.localeCompare(b.code));

  const blended = blendedLookup(matrix).get(playerId) ?? new Map<Position, number>();
  const topPositions = [...blended.entries()]
    .map(([position, rating]) => ({ position, rating }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  let batting = EMPTY_BATTING;
  for (const { line } of battingRows) batting = addBatting(batting, line);
  let pitching = EMPTY_PITCHING;
  for (const { line } of pitchingRows) pitching = addPitching(pitching, line);
  let fielding = EMPTY_FIELDING;
  for (const { line } of fieldingRows) fielding = addFielding(fielding, line);
  let catching = EMPTY_CATCHING;
  for (const { line } of catchingRows) catching = addCatching(catching, line);
  const bRates = battingRates(batting);
  const pRates = pitchingRates(pitching);
  const fRates = fieldingRates(fielding);
  const battingLine =
    batting.ab > 0
      ? `${batting.h}-for-${batting.ab} (${bRates.avg?.toFixed(3).replace(/^0/, "")} AVG, ` +
        `${bRates.ops?.toFixed(3).replace(/^0/, "")} OPS), ${batting.r} runs, ` +
        `${batting.rbi} RBI, ${batting.bb} walks`
      : null;
  const pitchingLine =
    pitching.outs > 0
      ? `${formatIp(pitching.outs)} innings pitched, ${pitching.k} strikeouts, ` +
        `${pRates.era === null ? "—" : pRates.era.toFixed(2)} ERA`
      : null;
  const fieldingLine =
    fRates.chances > 0
      ? `${fRates.chances} chances, ${fielding.e} errors` +
        (fRates.fpct !== null ? ` (${fRates.fpct.toFixed(3).replace(/^0/, "")} fielding pct)` : "")
      : null;
  const catchingLine =
    catching.outs > 0
      ? `${formatIp(catching.outs)} innings caught, ${catching.pb} passed balls`
      : null;

  // Playing time from the dugout's own game records — his data only.
  const gameIds = seasonGames.map((g) => g.id);
  const assignmentRows = gameIds.length
    ? await db.select().from(tables.gameAssignments)
    : [];
  const usage = computeSeasonUsage(
    seasonGames,
    assignmentRows.filter((a) => gameIds.includes(a.gameId)),
  ).get(playerId);
  const playingTimeLine =
    usage && usage.fieldInnings + usage.benchInnings > 0
      ? `${usage.games} games, ${usage.fieldInnings} innings in the field` +
        (usage.positions.length > 0
          ? ` (mostly ${usage.positions.slice(0, 3).map(([pos]) => pos).join(", ")})`
          : "")
      : null;

  return {
    firstName: row.firstName,
    monthLabel: monthLabel(month),
    seasonName: row.seasonName,
    seasonGoals: aspiration?.seasonGoals ?? null,
    desiredPositions: aspiration?.desiredPositions ?? null,
    topPositions,
    barsLines,
    sharedCues: noteRows.map((n) => ({
      category: n.category,
      tendency: n.tendency,
      cue: n.cue,
    })),
    battingLine,
    pitchingLine,
    fieldingLine,
    catchingLine,
    playingTimeLine,
  };
}

// The system prompt encodes the structure of the coaching staff's real
// parent letters so drafts read like the letters families already know —
// now carrying the BARS levels with their behavioral anchors.
export function buildReportPrompt(ctx: ReportContext): {
  system: string;
  user: string;
} {
  const system = [
    "You draft monthly update letters from the Crushers Blue 11U travel",
    "baseball coaching staff to one player's family. Follow the staff's",
    "letter structure exactly, in this order:",
    "",
    "1. A warm opening thanking the family for their commitment this month.",
    "2. A paragraph on the player's strengths — specific, evidence-based,",
    "   drawn from the data provided (levels 4-5, stats, positions).",
    "3. A section that begins exactly: \"Major areas that we intend to",
    "   focus on during the summer include:\" followed by 2-4 short",
    "   bullet lines (start each with \"- \"). Build each bullet from a",
    "   next-level target behavior in the data — name the specific",
    "   behavior we are adding, not a grade.",
    "4. Only if the data shows a genuinely concerning pattern, a short",
    "   \"Areas of concern:\" paragraph. Omit it entirely otherwise.",
    "5. If pitching cues are present, a paragraph starting \"Pitching",
    "   focus:\" that restates each tendency and the cue that corrects it.",
    "6. A short section beginning exactly: \"How to read our development",
    "   levels:\" — use the scale explanation provided, condensed but",
    "   faithful: criterion-referenced, 3 is the 11U standard and the",
    "   target, 5 is rare by design, no overall score, no comparisons.",
    "7. An invitation to a two-way conversation — the family should reach",
    "   out with questions or context the staff should know.",
    "8. An encouraging close about the month ahead.",
    "9. Sign off exactly:\nWith gratitude,\nThe Crushers Coaching Staff",
    "",
    "Rules: plain text only (no markdown headings, no asterisks). Use the",
    "player's first name. Development levels (1-5) MAY be named with their",
    "behavior descriptions — that is the point of the scale — but never",
    "compare to any other player, never rank, never compute an overall",
    "number, and never mention team distributions. Never invent facts not",
    "in the data. Keep it under 400 words, warm and specific — written",
    "for the parents of an 11-year-old.",
  ].join("\n");

  const lines: string[] = [
    `Player: ${ctx.firstName}`,
    `Report month: ${ctx.monthLabel}`,
    `Season: ${ctx.seasonName}`,
  ];
  if (ctx.seasonGoals) lines.push(`Family's season goal: ${ctx.seasonGoals}`);
  if (ctx.desiredPositions)
    lines.push(`Positions ${ctx.firstName} wants to play: ${ctx.desiredPositions}`);
  if (ctx.topPositions.length > 0)
    lines.push(
      "Strongest positions (coach evaluations): " +
        ctx.topPositions.map((p) => p.position).join(", "),
    );
  for (const b of ctx.barsLines) {
    lines.push(
      `Development level — ${b.label}: ${b.level} of 5. Where he is: ${b.anchorNow}` +
        (b.nextTarget ? ` Next target behavior: ${b.nextTarget}` : ""),
    );
  }
  for (const cue of ctx.sharedCues)
    lines.push(
      `Shared ${cue.category} cue: tendency "${cue.tendency}" → cue "${cue.cue}"`,
    );
  if (ctx.battingLine) lines.push(`Season batting: ${ctx.battingLine}`);
  if (ctx.pitchingLine) lines.push(`Season pitching: ${ctx.pitchingLine}`);
  if (ctx.fieldingLine) lines.push(`Season fielding: ${ctx.fieldingLine}`);
  if (ctx.catchingLine) lines.push(`Season catching: ${ctx.catchingLine}`);
  if (ctx.playingTimeLine)
    lines.push(`Playing time so far: ${ctx.playingTimeLine}`);
  lines.push(`Scale explanation to convey: ${BARS_SCALE_EXPLANATION}`);

  return { system, user: lines.join("\n") };
}

// Deterministic fallback used when no ANTHROPIC_API_KEY is configured (and
// in tests): same structure, no model call, so the review→publish flow
// works everywhere.
export function templateDraft(ctx: ReportContext): string {
  const strengths = ctx.barsLines.filter((b) => b.level >= 4);
  const focus = ctx.barsLines.filter((b) => b.level < 4 && b.nextTarget);
  const pitchCues = ctx.sharedCues.filter((c) => c.category === "pitching");
  const otherCues = ctx.sharedCues.filter((c) => c.category !== "pitching");

  const parts: string[] = [];
  parts.push(
    `Dear ${ctx.firstName}'s family,`,
    "",
    `Thank you for everything you put into ${ctx.monthLabel} — the drives,` +
      ` the early mornings, and the support from the fence line never go` +
      ` unnoticed by the staff.`,
    "",
  );

  let strengthSentence = `${ctx.firstName} has continued to grow this month.`;
  if (strengths.length > 0) {
    strengthSentence =
      `${ctx.firstName} is above the 11U standard in ` +
      joinAnd(strengths.map((s) => s.label.toLowerCase())) +
      ` — ${strengths[0].anchorNow.toLowerCase()}`;
  }
  if (ctx.topPositions.length > 0) {
    strengthSentence +=
      ` On the field, ${ctx.firstName} has looked most comfortable at ` +
      joinAnd(ctx.topPositions.map((p) => p.position)) +
      ".";
  }
  if (ctx.battingLine) strengthSentence += ` At the plate: ${ctx.battingLine}.`;
  if (ctx.pitchingLine)
    strengthSentence += ` On the mound: ${ctx.pitchingLine}.`;
  if (ctx.playingTimeLine)
    strengthSentence += ` Playing time so far: ${ctx.playingTimeLine}.`;
  parts.push(strengthSentence, "");

  parts.push("Major areas that we intend to focus on during the summer include:");
  const bullets: string[] = [];
  for (const f of focus.slice(0, 3)) {
    bullets.push(`- ${f.label}: ${f.nextTarget}`);
  }
  for (const cue of otherCues.slice(0, Math.max(1, 3 - bullets.length)))
    bullets.push(`- ${cue.cue}`);
  if (ctx.seasonGoals) bullets.push(`- The family goal: ${ctx.seasonGoals}`);
  if (bullets.length === 0)
    bullets.push("- Keeping up the daily habits that got us here");
  parts.push(...bullets, "");

  if (pitchCues.length > 0) {
    parts.push(
      "Pitching focus: " +
        pitchCues
          .map((c) => `we're working on "${c.tendency}" — the cue is "${c.cue}"`)
          .join("; ") +
        ". A few focused reps at home each week make a real difference.",
      "",
    );
  }

  parts.push(
    `How to read our development levels: ${BARS_SCALE_EXPLANATION}`,
    "",
    `As always, this is a two-way conversation — if there is anything` +
      ` going on that would help us coach ${ctx.firstName} better, or` +
      ` anything in this note you would like to talk through, please` +
      ` reach out.`,
    "",
    `We are excited for what the next month holds. Keep throwing, keep` +
      ` swinging, and keep having fun.`,
    "",
    "With gratitude,",
    "The Crushers Coaching Staff",
  );
  return parts.join("\n");
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Draft the letter: Claude when ANTHROPIC_API_KEY is configured, the
 * deterministic template otherwise. Returns the text plus which drafter
 * produced it (stored on the report row).
 */
/** Errors that mean "this model isn't on your plan" — worth falling back. */
function modelUnavailable(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status === 404) return true;
  return err.status === 403 && /model|not available|plan/i.test(err.message);
}

export async function draftReport(
  ctx: ReportContext,
): Promise<{ text: string; draftedBy: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: templateDraft(ctx), draftedBy: "template" };
  }
  const client = new Anthropic();
  const { system, user } = buildReportPrompt(ctx);
  let lastError: unknown;
  for (const model of REPORT_MODELS) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: 2000,
        ...(model === "claude-haiku-4-5" ? {} : { thinking: { type: "adaptive" as const } }),
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("The model returned an empty draft.");
      return { text, draftedBy: model };
    } catch (err) {
      lastError = err;
      if (modelUnavailable(err)) continue; // try the next tier
      throw err;
    }
  }
  // No model on this plan could draft — fall back to the template rather
  // than dead-ending the coach.
  console.error("all report models unavailable:", lastError);
  return { text: templateDraft(ctx), draftedBy: "template" };
}
