import { describe, expect, it } from "vitest";
import { eventHeadcount, pickNextEvent, restingPitchers } from "./home";

const at = (iso: string) => new Date(iso);

describe("pickNextEvent", () => {
  const events = [
    { id: "past", startsAt: at("2026-07-18T17:00:00Z"), endsAt: at("2026-07-18T19:00:00Z") },
    { id: "ongoing", startsAt: at("2026-07-20T17:00:00Z"), endsAt: at("2026-07-20T19:00:00Z") },
    { id: "future", startsAt: at("2026-07-22T17:00:00Z"), endsAt: null },
  ];

  it("prefers an event still in progress over a later one", () => {
    const next = pickNextEvent(events, at("2026-07-20T18:00:00Z"));
    expect(next?.id).toBe("ongoing");
  });

  it("skips finished events", () => {
    const next = pickNextEvent(events, at("2026-07-21T00:00:00Z"));
    expect(next?.id).toBe("future");
  });

  it("keeps an end-less event relevant for three hours", () => {
    const next = pickNextEvent(events, at("2026-07-22T19:30:00Z"));
    expect(next?.id).toBe("future");
    expect(pickNextEvent(events, at("2026-07-22T20:30:00Z"))).toBeNull();
  });

  it("returns null with nothing upcoming", () => {
    expect(pickNextEvent([], at("2026-07-20T00:00:00Z"))).toBeNull();
  });
});

describe("eventHeadcount", () => {
  const roster = [
    { playerId: "a", firstName: "Eli" },
    { playerId: "b", firstName: "Cole" },
    { playerId: "c", firstName: "Leo" },
    { playerId: "d", firstName: "Finn" },
  ];

  it("counts silence as its own bucket, with names", () => {
    const rsvps = new Map([
      ["a", "yes" as const],
      ["b", "no" as const],
      ["c", "maybe" as const],
    ]);
    const c = eventHeadcount(roster, rsvps);
    expect(c).toMatchObject({ yes: 1, no: 1, maybe: 1, unanswered: 1 });
    expect(c.unansweredNames).toEqual(["Finn"]);
  });

  it("treats a missing rsvp map as all-unanswered", () => {
    const c = eventHeadcount(roster, undefined);
    expect(c.unanswered).toBe(4);
  });
});

describe("restingPitchers", () => {
  it("flags a heavy outing until rest days elapse", () => {
    const flagged = restingPitchers(
      [{ playerId: "p1", day: "2026-07-18", pitches: 62 }],
      "2026-07-20",
    );
    // 51–65 pitches → 3 rest days → eligible again 7/22.
    expect(flagged).toHaveLength(1);
    expect(flagged[0].eligibility.nextEligibleDay).toBe("2026-07-22");
  });

  it("ignores light work and elapsed rest", () => {
    expect(
      restingPitchers([{ playerId: "p1", day: "2026-07-19", pitches: 15 }], "2026-07-20"),
    ).toHaveLength(0);
    expect(
      restingPitchers([{ playerId: "p1", day: "2026-07-10", pitches: 70 }], "2026-07-20"),
    ).toHaveLength(0);
  });

  it("sums split innings on the same day before judging", () => {
    const flagged = restingPitchers(
      [
        { playerId: "p1", day: "2026-07-19", pitches: 18 },
        { playerId: "p1", day: "2026-07-19", pitches: 18 },
      ],
      "2026-07-20",
    );
    // 36 total → 2 rest days, even though each inning alone needs none.
    expect(flagged).toHaveLength(1);
  });
});
