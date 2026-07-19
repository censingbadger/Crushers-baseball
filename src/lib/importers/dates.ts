// Date/time parsing for values as they appear in the organizing Google
// Sheet: dates like "6/11" or "03/31/2016", times like "5:30 - 7:00" with a
// separate "(pm)" hint in the row label.

export function parseSheetDate(
  raw: string,
  defaultYear: number,
): { year: number; month: number; day: number } | null {
  const cleaned = raw.trim();
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = defaultYear;
  if (m[3]) {
    year = Number(m[3]);
    if (year < 100) year += 2000;
  }
  return { year, month, day };
}

export function toIsoDate(d: { year: number; month: number; day: number }): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

/**
 * Parse a time range like "5:30 - 7:00" (pm implied for youth practice) into
 * start/end minutes since midnight. `assumePm` shifts ambiguous hours < 12.
 */
export function parseTimeRange(
  raw: string,
  assumePm = true,
): { startMinutes: number; endMinutes: number } | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const toMinutes = (h: number, min: number) => {
    let hour = h;
    if (assumePm && hour < 12) hour += 12;
    return hour * 60 + min;
  };
  const start = toMinutes(Number(m[1]), Number(m[2] ?? 0));
  let end = toMinutes(Number(m[3]), Number(m[4] ?? 0));
  // "11:00 - 1:00" style wraparound: keep end after start.
  if (end <= start) end += 12 * 60;
  return { startMinutes: start, endMinutes: end };
}

export function dateAtMinutes(
  d: { year: number; month: number; day: number },
  minutes: number,
): Date {
  return new Date(d.year, d.month - 1, d.day, Math.floor(minutes / 60), minutes % 60);
}
