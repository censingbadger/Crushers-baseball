import { describe, expect, it } from "vitest";
import { parseSheetDate, parseTimeRange, toIsoDate } from "./dates";

describe("parseSheetDate", () => {
  it("parses month/day with a default year", () => {
    expect(parseSheetDate("6/11", 2026)).toEqual({ year: 2026, month: 6, day: 11 });
  });

  it("parses full dates", () => {
    expect(parseSheetDate("03/31/2016", 2026)).toEqual({ year: 2016, month: 3, day: 31 });
  });

  it("expands two-digit years", () => {
    expect(parseSheetDate("2/7/16", 2026)).toEqual({ year: 2016, month: 2, day: 7 });
  });

  it("rejects junk", () => {
    expect(parseSheetDate("Fri", 2026)).toBeNull();
    expect(parseSheetDate("13/40", 2026)).toBeNull();
    expect(parseSheetDate("", 2026)).toBeNull();
  });

  it("formats ISO dates", () => {
    expect(toIsoDate({ year: 2026, month: 6, day: 5 })).toBe("2026-06-05");
  });
});

describe("parseTimeRange", () => {
  it("assumes pm for youth practice times", () => {
    expect(parseTimeRange("5:30 - 7:00")).toEqual({
      startMinutes: 17 * 60 + 30,
      endMinutes: 19 * 60,
    });
  });

  it("handles hour-only values", () => {
    expect(parseTimeRange("5 - 7")).toEqual({
      startMinutes: 17 * 60,
      endMinutes: 19 * 60,
    });
  });

  it("keeps the end after the start across noon", () => {
    const r = parseTimeRange("11:00 - 1:00");
    expect(r).not.toBeNull();
    expect(r!.endMinutes).toBeGreaterThan(r!.startMinutes);
  });

  it("rejects junk", () => {
    expect(parseTimeRange("all day")).toBeNull();
  });
});
