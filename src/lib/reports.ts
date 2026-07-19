import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { Position } from "@/db/schema";
import { DIMENSION_LABEL, dimensionTrend } from "@/lib/development";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import {
  addBatting,
  addPitching,
  battingRates,
  EMPTY_BATTING,
  EMPTY_PITCHING,
  formatIp,
  pitchingRates,
} from "@/lib/stats";

// Everything that reaches the model (or the template) lives in this shape.
// It is assembled from family-shareable data only: first name, the family's
// own goals, shared cues, rating trends, matrix highlights, and stat totals.
// Contacts, medical notes, coach-only dev notes, and other players' data
// must never be added here.
export interface ReportContext {
  firstName: string;
  monthLabel: string;
  seasonName: string;
  seasonGoals: string | null;
  desiredPositions: string | null;
  /** Blended matrix highlights, strongest first (max 3). */
  topPositions: { position: Position; rating: number }[];
  /** Rated dimensions with their latest snapshot and direction. */
  trends: {
    label: string;
    latest: number;
    direction: "up" | "down" | "flat" | null;
  }[];
  /** Shared tendency→cue pairs (already family-visible by design). */
  sharedCues: { category: string; tendency: string; cue: string }[];
  battingLine: string | null;
  pitchingLine: string | null;
}

export const REPORT_MODEL = "claude-opus-4-8";

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (!y || !m || m < 1 || m > 12) return month;
  return `${names[m - 1]} ${y}`;
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

  const [aspirationRows, ratingRows, noteRows, matrix, battingRows, pitchingRows] =
    await Promise.all([
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
        .from(tables.playerRatings)
        .where(
          and(
            eq(tables.playerRatings.seasonId, seasonId),
            eq(tables.playerRatings.playerId, playerId),
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
        .select({ line: tables.battingLines, gameSeason: tables.statGames.seasonId })
        .from(tables.battingLines)
        .innerJoin(tables.statGames, eq(tables.battingLines.statGameId, tables.statGames.id))
        .where(
          and(
            eq(tables.statGames.seasonId, seasonId),
            eq(tables.battingLines.playerId, playerId),
          ),
        ),
      db
        .select({ line: tables.pitchingLines, gameSeason: tables.statGames.seasonId })
        .from(tables.pitchingLines)
        .innerJoin(tables.statGames, eq(tables.pitchingLines.statGameId, tables.statGames.id))
        .where(
          and(
            eq(tables.statGames.seasonId, seasonId),
            eq(tables.pitchingLines.playerId, playerId),
          ),
        ),
    ]);

  const aspiration = aspirationRows[0];

  const byDimension = new Map<string, { rating: number; createdAt: Date }[]>();
  for (const r of ratingRows) {
    const list = byDimension.get(r.dimension) ?? [];
    list.push({ rating: r.rating, createdAt: r.createdAt });
    byDimension.set(r.dimension, list);
  }
  const trends: ReportContext["trends"] = [];
  for (const [dim, rows] of byDimension) {
    const t = dimensionTrend(rows);
    if (t.latest !== null) {
      trends.push({
        label: DIMENSION_LABEL[dim as keyof typeof DIMENSION_LABEL] ?? dim,
        latest: t.latest,
        direction: t.direction,
      });
    }
  }
  trends.sort((a, b) => b.latest - a.latest);

  const blended = blendedLookup(matrix).get(playerId) ?? new Map<Position, number>();
  const topPositions = [...blended.entries()]
    .map(([position, rating]) => ({ position, rating }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  let batting = EMPTY_BATTING;
  for (const { line } of battingRows) batting = addBatting(batting, line);
  let pitching = EMPTY_PITCHING;
  for (const { line } of pitchingRows) pitching = addPitching(pitching, line);
  const bRates = battingRates(batting);
  const pRates = pitchingRates(pitching);
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

  return {
    firstName: row.firstName,
    monthLabel: monthLabel(month),
    seasonName: row.seasonName,
    seasonGoals: aspiration?.seasonGoals ?? null,
    desiredPositions: aspiration?.desiredPositions ?? null,
    topPositions,
    trends,
    sharedCues: noteRows.map((n) => ({
      category: n.category,
      tendency: n.tendency,
      cue: n.cue,
    })),
    battingLine,
    pitchingLine,
  };
}

// The system prompt encodes the structure of the coaching staff's real
// parent letters so drafts read like the letters families already know.
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
    "   drawn from the data provided.",
    "3. A section that begins exactly: \"Major areas that we intend to",
    "   focus on during the summer include:\" followed by 2-4 short",
    "   bullet lines (start each with \"- \").",
    "4. Only if the data shows a genuinely concerning pattern, a short",
    "   \"Areas of concern:\" paragraph. Omit it entirely otherwise.",
    "5. If pitching cues are present, a paragraph starting \"Pitching",
    "   focus:\" that restates each tendency and the cue that corrects it.",
    "6. A paragraph placing this work inside the team's development",
    "   program: the player is building from AA toward AAA-level habits,",
    "   and daily reps at home matter more than weekend results.",
    "7. An invitation to a two-way conversation — the family should reach",
    "   out with questions or context the staff should know.",
    "8. An encouraging close about the month ahead.",
    "9. Sign off exactly:\nWith gratitude,\nThe Crushers Coaching Staff",
    "",
    "Rules: plain text only (no markdown headings, no asterisks). Use the",
    "player's first name. Never mention numeric ratings, rankings, or any",
    "other player. Never invent facts not in the data. Keep it under 350",
    "words, warm and specific — written for the parents of an 11-year-old.",
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
  if (ctx.trends.length > 0)
    lines.push(
      "Coach development ratings (1-5, latest and direction): " +
        ctx.trends
          .map((t) => `${t.label} ${t.latest}${t.direction ? ` (${t.direction})` : ""}`)
          .join("; "),
    );
  for (const cue of ctx.sharedCues)
    lines.push(
      `Shared ${cue.category} cue: tendency "${cue.tendency}" → cue "${cue.cue}"`,
    );
  if (ctx.battingLine) lines.push(`Season batting: ${ctx.battingLine}`);
  if (ctx.pitchingLine) lines.push(`Season pitching: ${ctx.pitchingLine}`);

  return { system, user: lines.join("\n") };
}

// Deterministic fallback used when no ANTHROPIC_API_KEY is configured (and
// in tests): same structure, no model call, so the review→publish flow
// works everywhere.
export function templateDraft(ctx: ReportContext): string {
  const strengths = ctx.trends.filter((t) => t.latest >= 4).map((t) => t.label);
  const focus = ctx.trends.filter((t) => t.latest <= 3).map((t) => t.label);
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
      `${ctx.firstName}'s ${joinAnd(strengths.map((s) => s.toLowerCase()))}` +
      ` ${strengths.length > 1 ? "have" : "has"} stood out to the staff.`;
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
  parts.push(strengthSentence, "");

  parts.push("Major areas that we intend to focus on during the summer include:");
  const bullets: string[] = [];
  for (const f of focus.slice(0, 3)) bullets.push(`- ${f}`);
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
    `All of this sits inside the same development program we talk about` +
      ` all year: ${ctx.firstName} is building from AA habits toward AAA` +
      ` habits, and the daily reps matter far more than any weekend's` +
      ` results.`,
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
export async function draftReport(
  ctx: ReportContext,
): Promise<{ text: string; draftedBy: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: templateDraft(ctx), draftedBy: "template" };
  }
  const client = new Anthropic();
  const { system, user } = buildReportPrompt(ctx);
  const message = await client.messages.create({
    model: REPORT_MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("The model returned an empty draft.");
  return { text, draftedBy: REPORT_MODEL };
}
