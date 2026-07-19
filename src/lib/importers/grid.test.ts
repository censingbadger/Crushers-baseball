import { describe, expect, it } from "vitest";
import { matchPlayerByName, parseAvailabilityGridCsv } from "./grid";

// Synthetic fixtures mirroring the Sheet's Practice RSVP and Tournament
// Availability tabs. All names fictional.

const PRACTICE_CSV = [
  "Please mark your player's practice availability below:,,,",
  "Day,Thurs,Tues,Thurs",
  "Date,6/11,6/16,6/18",
  "Time (pm),5:30 - 7:00,5:30 - 7:00,5:30 - 7:00",
  "Location,White Cross,White Cross,Indoor Cage",
  "Milo Vance,Yes,No,TBD",
  "Theo Ramos,,Yes,Yes",
  "Jax Turner,No,No,No",
  ",,,",
  "Total Players Available,1,1,1",
  ",,,",
  "Parents: If you are able to help at practice, please add your name below.,,,",
  "Day,Thurs,Tues,Thurs",
  "Date,6/11,6/16,6/18",
  ",Perry Vance,Perry Vance,",
].join("\n");

const TOURNAMENT_CSV = [
  "Please mark your player's tournament availability below:,,,",
  "Day,Fri,Sat,Sun",
  "Date,6/26,6/27,6/28",
  "Time (pm),,,",
  "Location,,,",
  "Milo Vance,Yes,Yes,Yes",
  "Theo Ramos,No,TBD,Yes",
  ",,,",
  "Total Players Available,1,1,2",
  ",,,",
  "Practice Players,,,",
  "Ryder Quinn,Yes,No,No",
  ",,,",
  "Note: We are NOT attending tournaments on all of these dates.,,,",
].join("\n");

describe("parseAvailabilityGridCsv — practice tab", () => {
  const result = parseAvailabilityGridCsv(PRACTICE_CSV, 2026);

  it("finds the date columns with times and locations", () => {
    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].isoDate).toBe("2026-06-11");
    expect(result.columns[0].startsAt?.getHours()).toBe(17);
    expect(result.columns[0].startsAt?.getMinutes()).toBe(30);
    expect(result.columns[0].endsAt?.getHours()).toBe(19);
    expect(result.columns[2].location).toBe("Indoor Cage");
  });

  it("collects player rows and stops before the helper section", () => {
    expect(result.players.map((p) => p.name)).toEqual([
      "Milo Vance",
      "Theo Ramos",
      "Jax Turner",
    ]);
  });

  it("maps Yes/No/TBD/blank answers", () => {
    expect(result.players[0].answers).toEqual(["yes", "no", "maybe"]);
    expect(result.players[1].answers).toEqual([null, "yes", "yes"]);
  });
});

describe("parseAvailabilityGridCsv — tournament tab", () => {
  const result = parseAvailabilityGridCsv(TOURNAMENT_CSV, 2026);

  it("handles missing times without creating start dates", () => {
    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].startsAt).toBeNull();
  });

  it("includes rows from the Practice Players section", () => {
    expect(result.players.map((p) => p.name)).toEqual([
      "Milo Vance",
      "Theo Ramos",
      "Ryder Quinn",
    ]);
    expect(result.players[2].answers).toEqual(["yes", "no", "no"]);
  });
});

describe("matchPlayerByName", () => {
  const roster = [
    { id: "a", firstName: "Milo", lastName: "Vance" },
    { id: "b", firstName: "Theo", lastName: "Ramos" },
    { id: "c", firstName: "Ryder", lastName: "Quinn" },
  ];

  it("matches full names case-insensitively", () => {
    expect(matchPlayerByName("milo  vance", roster)).toBe("a");
  });

  it("matches an unambiguous first name", () => {
    expect(matchPlayerByName("Theo", roster)).toBe("b");
  });

  it("returns null when nothing matches", () => {
    expect(matchPlayerByName("Somebody Else", roster)).toBeNull();
  });
});
