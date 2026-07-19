import { describe, expect, it } from "vitest";
import { parseGameChangerCsv } from "./gamechanger";

// Synthetic fixtures shaped like GameChanger season exports. Fictional names.
const ROSTER = [
  { id: "a", firstName: "Milo", lastName: "Vance" },
  { id: "b", firstName: "Theo", lastName: "Ramos" },
];

const BATTING_CSV = [
  "Number,Last,First,GP,PA,AB,AVG,OBP,OPS,SLG,H,1B,2B,3B,HR,RBI,R,BB,SO,K-L,HBP,SAC,SF,SB,CS",
  "2,Vance,Milo,12,40,32,.406,.500,1.100,.600,13,9,2,1,1,10,11,6,4,1,2,0,1,8,1",
  "5,Ramos,Theo,12,38,30,.300,.395,.795,.400,9,7,2,0,0,7,8,5,6,2,1,1,0,4,0",
  "99,Ghost,Gary,3,5,5,.200,.200,.400,.200,1,1,0,0,0,0,0,0,2,1,0,0,0,0,0",
  "Totals,,,12,83,67,.343,.440,.940,.500,23,17,4,1,1,17,19,11,12,4,3,1,1,12,1",
].join("\n");

const PITCHING_CSV = [
  "Number,Last,First,GP,GS,IP,W,L,SV,H,R,ER,BB,SO,HBP,BF,#P,ERA,WHIP",
  "2,Vance,Milo,6,4,15.2,3,1,0,12,8,6,7,22,1,70,265,2.30,1.21",
  "5,Ramos,Theo,4,2,8.0,1,1,0,10,7,5,4,9,0,40,150,3.75,1.75",
].join("\n");

describe("parseGameChangerCsv — batting", () => {
  const result = parseGameChangerCsv(BATTING_CSV, "batting", ROSTER);

  it("imports matched players and skips totals and unknowns", () => {
    expect(result.lines).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes("Gary Ghost"))).toBe(true);
  });

  it("maps the counting stats", () => {
    const milo = result.lines[0];
    expect(milo.playerId).toBe("a");
    expect(milo.stats).toMatchObject({
      ab: 32, h: 13, doubles: 2, triples: 1, hr: 1,
      rbi: 10, r: 11, bb: 6, k: 4, hbp: 2, sf: 1, sb: 8,
    });
  });
});

describe("parseGameChangerCsv — pitching", () => {
  const result = parseGameChangerCsv(PITCHING_CSV, "pitching", ROSTER);

  it("converts GC innings notation to outs", () => {
    expect(result.lines[0].stats.outs).toBe(47); // 15.2 IP
    expect(result.lines[1].stats.outs).toBe(24); // 8.0 IP
  });

  it("maps pitching counting stats", () => {
    expect(result.lines[0].stats).toMatchObject({
      bf: 70, pitches: 265, h: 12, r: 8, er: 6, bb: 7, k: 22,
    });
  });
});

describe("parseGameChangerCsv — name variants", () => {
  it("handles a single 'Name' column with Last, First format", () => {
    const csv = ["Name,AB,H,RBI", '"Vance, Milo",10,4,3'].join("\n");
    const r = parseGameChangerCsv(csv, "batting", ROSTER);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].playerId).toBe("a");
  });

  it("reports when no header row is found", () => {
    const r = parseGameChangerCsv("just,some,junk\n1,2,3", "batting", ROSTER);
    expect(r.lines).toHaveLength(0);
    expect(r.warnings[0]).toContain("header row");
  });
});
