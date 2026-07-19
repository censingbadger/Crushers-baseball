import type { RatingDimension } from "@/db/schema";

export const DIMENSIONS: { key: RatingDimension; label: string; intangible?: boolean }[] = [
  { key: "hitting", label: "Hitting" },
  { key: "fielding", label: "Fielding" },
  { key: "arm", label: "Arm strength" },
  { key: "speed", label: "Speed & baserunning" },
  { key: "iq", label: "Baseball IQ" },
  { key: "dugout", label: "Dugout behavior", intangible: true },
  { key: "focus", label: "Focus on the field", intangible: true },
  { key: "effort", label: "Effort", intangible: true },
  { key: "coachability", label: "Coachability", intangible: true },
];

export const DIMENSION_LABEL = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d.label]),
) as Record<RatingDimension, string>;

/** "Coach Demo" -> "CD"; single names keep their first two letters. */
export function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export interface TrendPoint {
  rating: number;
  createdAt: Date;
}

export interface DimensionTrend {
  latest: number | null;
  direction: "up" | "down" | "flat" | null;
  points: number[]; // chronological, most recent last (capped)
}

/** Rows may arrive in any order; trend compares the two latest snapshots. */
export function dimensionTrend(rows: TrendPoint[], cap = 6): DimensionTrend {
  if (rows.length === 0) return { latest: null, direction: null, points: [] };
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const points = sorted.map((r) => r.rating).slice(-cap);
  const latest = points[points.length - 1];
  if (points.length < 2) return { latest, direction: null, points };
  const prev = points[points.length - 2];
  const direction = latest > prev ? "up" : latest < prev ? "down" : "flat";
  return { latest, direction, points };
}
