// Derived stats on a 6-inning youth game basis (goal 5).

export interface BattingTotals {
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  hbp: number;
  sf: number;
}

export interface PitchingTotals {
  outs: number;
  bf: number;
  pitches: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
}

export const EMPTY_BATTING: BattingTotals = {
  ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
  rbi: 0, bb: 0, k: 0, sb: 0, hbp: 0, sf: 0,
};

export const EMPTY_PITCHING: PitchingTotals = {
  outs: 0, bf: 0, pitches: 0, h: 0, r: 0, er: 0, bb: 0, k: 0,
};

export function addBatting(a: BattingTotals, b: Partial<BattingTotals>): BattingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_BATTING) as (keyof BattingTotals)[]) {
    out[key] = a[key] + (b[key] ?? 0);
  }
  return out;
}

export function addPitching(a: PitchingTotals, b: Partial<PitchingTotals>): PitchingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_PITCHING) as (keyof PitchingTotals)[]) {
    out[key] = a[key] + (b[key] ?? 0);
  }
  return out;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function battingRates(t: BattingTotals) {
  const singles = t.h - t.doubles - t.triples - t.hr;
  const tb = singles + 2 * t.doubles + 3 * t.triples + 4 * t.hr;
  const obpDen = t.ab + t.bb + t.hbp + t.sf;
  const avg = t.ab > 0 ? round3(t.h / t.ab) : null;
  const obp = obpDen > 0 ? round3((t.h + t.bb + t.hbp) / obpDen) : null;
  const slg = t.ab > 0 ? round3(tb / t.ab) : null;
  const ops = obp !== null && slg !== null ? round3(obp + slg) : null;
  return { avg, obp, slg, ops, tb };
}

/** ERA and WHIP on a 6-inning game basis; outs are thirds of an inning. */
export function pitchingRates(t: PitchingTotals, inningsBasis = 6) {
  const ip = t.outs / 3;
  const era = t.outs > 0 ? round2((t.er * inningsBasis) / ip) : null;
  const whip = t.outs > 0 ? round2((t.bb + t.h) / ip) : null;
  return { ip, era, whip };
}

/** "11 outs" -> "3.2" innings-pitched notation. */
export function formatIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

// GameChanger's other two exports: fielding and catching.

export interface FieldingTotals {
  po: number;
  a: number;
  e: number;
  dp: number;
}

export interface CatchingTotals {
  outs: number;
  pb: number;
  sbAllowed: number;
  cs: number;
}

export const EMPTY_FIELDING: FieldingTotals = { po: 0, a: 0, e: 0, dp: 0 };
export const EMPTY_CATCHING: CatchingTotals = { outs: 0, pb: 0, sbAllowed: 0, cs: 0 };

export function addFielding(a: FieldingTotals, b: Partial<FieldingTotals>): FieldingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_FIELDING) as (keyof FieldingTotals)[]) {
    out[key] = a[key] + (b[key] ?? 0);
  }
  return out;
}

export function addCatching(a: CatchingTotals, b: Partial<CatchingTotals>): CatchingTotals {
  const out = { ...a };
  for (const key of Object.keys(EMPTY_CATCHING) as (keyof CatchingTotals)[]) {
    out[key] = a[key] + (b[key] ?? 0);
  }
  return out;
}

export function fieldingRates(t: FieldingTotals) {
  const chances = t.po + t.a + t.e;
  return {
    chances,
    fpct: chances > 0 ? round3((t.po + t.a) / chances) : null,
  };
}

export function catchingRates(t: CatchingTotals) {
  const attempts = t.sbAllowed + t.cs;
  return {
    attempts,
    csPct: attempts > 0 ? round3(t.cs / attempts) : null,
  };
}

/** Parse GC-style IP notation: "3.2" = 3 innings + 2 outs -> 11 outs. */
export function parseIpToOuts(raw: string | number): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d+)(?:\.([0-2]))?$/);
  if (!m) return null;
  return Number(m[1]) * 3 + Number(m[2] ?? 0);
}
