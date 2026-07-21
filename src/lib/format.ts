const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "numeric",
  day: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatEventDate(d: Date): string {
  return DATE_FMT.format(d);
}

export function formatEventTime(start: Date, end: Date | null): string {
  const s = TIME_FMT.format(start);
  return end ? `${s} – ${TIME_FMT.format(end)}` : s;
}

export function formatIsoDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DATE_FMT.format(new Date(y, m - 1, d));
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  practice: "Practice",
  game: "Game",
  tournament: "Tournament",
};

/** "Mike Christian" → "MC" — the rater label a coach's ratings file under. */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.trim().slice(0, 2).toUpperCase();
}

export const RSVP_LABEL: Record<string, string> = {
  yes: "In",
  no: "Out",
  maybe: "Maybe",
};

/** "just now" / "45s ago" / "3m ago" / "2h 05m ago" — the edit trail's clock. */
export function relTime(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m ago`;
}
