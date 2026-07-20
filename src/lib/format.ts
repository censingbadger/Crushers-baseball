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
