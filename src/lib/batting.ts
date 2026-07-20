import { battingRates, type BattingTotals } from "@/lib/stats";

// Batting order generator. Youth samples are tiny (a season is 30 ABs), so
// GameChanger rates get blended with the coaches' 1–5 hitting rating, with
// the stats' weight growing as at-bats accumulate. Roles follow the classic
// construction: get on base up top, best bat third, power fourth, and — with
// a continuous lineup — a "second leadoff" in the last spot so the top of
// the order finds runners on.

export interface BatterInput {
  playerId: string;
  batting: BattingTotals | null;
  /** Latest coach "hitting" rating, 1–5. */
  hittingRating: number | null;
}

export interface OrderSuggestion {
  order: string[];
  /** playerId → why they landed where they did. */
  reasons: Record<string, string>;
}

interface Profile {
  playerId: string;
  obp: number;
  slg: number;
  contact: number;
  speed: number;
  quality: number;
  hasStats: boolean;
}

function normalize(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || max === min) return () => 0.5;
  return (v: number) => (v - min) / (max - min);
}

const fmt3 = (v: number) => v.toFixed(3).replace(/^0/, "");

export function suggestBattingOrder(batters: BatterInput[]): OrderSuggestion {
  if (batters.length === 0) return { order: [], reasons: {} };

  const raw = batters.map((b) => {
    const t = b.batting;
    const rates = t ? battingRates(t) : null;
    const pa = t ? t.ab + t.bb + t.hbp + t.sf : 0;
    return {
      playerId: b.playerId,
      hasStats: pa > 0,
      ab: t?.ab ?? 0,
      obp: rates?.obp ?? 0,
      slg: rates?.slg ?? 0,
      contact: pa > 0 ? 1 - (t!.k ?? 0) / pa : 0,
      speed: t?.sb ?? 0,
      coach: b.hittingRating !== null ? (b.hittingRating - 1) / 4 : 0.45,
    };
  });

  const withStats = raw.filter((r) => r.hasStats);
  const nObp = normalize(withStats.map((r) => r.obp));
  const nSlg = normalize(withStats.map((r) => r.slg));
  const nContact = normalize(withStats.map((r) => r.contact));
  const nSpeed = normalize(withStats.map((r) => r.speed));

  const profiles: Profile[] = raw
    .map((r) => {
      const statQ = r.hasStats ? nObp(r.obp) * 0.6 + nSlg(r.slg) * 0.4 : 0;
      // Confidence in the stat line grows with at-bats.
      const rel = r.hasStats ? r.ab / (r.ab + 12) : 0;
      return {
        playerId: r.playerId,
        obp: r.hasStats ? nObp(r.obp) : r.coach,
        slg: r.hasStats ? nSlg(r.slg) : r.coach,
        contact: r.hasStats ? nContact(r.contact) : r.coach,
        speed: r.hasStats ? nSpeed(r.speed) : 0.5,
        quality: rel * statQ + (1 - rel) * r.coach,
        hasStats: r.hasStats,
      };
    })
    // Deterministic tie-break so the same inputs give the same order.
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  const remaining = new Set(profiles.map((p) => p.playerId));
  const byId = new Map(profiles.map((p) => [p.playerId, p]));
  const reasons: Record<string, string> = {};
  const rawById = new Map(raw.map((r) => [r.playerId, r]));

  function take(score: (p: Profile) => number): Profile {
    let best: Profile | null = null;
    let bestScore = -Infinity;
    for (const id of remaining) {
      const p = byId.get(id)!;
      const s = score(p);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    remaining.delete(best!.playerId);
    return best!;
  }

  const statNote = (p: Profile, fallback: string) => {
    const r = rawById.get(p.playerId)!;
    return p.hasStats ? fallback.replace("{obp}", fmt3(r.obp)).replace("{slg}", fmt3(r.slg)) : "coach rating";
  };

  const n = batters.length;
  const slots: (Profile | null)[] = Array.from({ length: n }, () => null);

  // Draft order protects the classic construction: the best bat is locked
  // into the 3-hole before leadoff can poach a high-OBP star.
  if (n >= 3) {
    const three = take((p) => p.quality);
    slots[2] = three;
    reasons[three.playerId] = "third — best overall bat";
  }

  const leadoff = take((p) => p.obp * 0.7 + p.speed * 0.3);
  slots[0] = leadoff;
  reasons[leadoff.playerId] = `leadoff — gets on (${statNote(leadoff, "{obp} OBP")}) with speed`;
  if (n >= 4) {
    const four = take((p) => p.slg);
    slots[3] = four;
    reasons[four.playerId] = `cleanup — most pop (${statNote(four, "{slg} SLG")})`;
  }
  if (n >= 2) {
    const two = take((p) => p.contact * 0.6 + p.obp * 0.4);
    slots[1] = two;
    reasons[two.playerId] = "second — puts the ball in play";
  }
  if (n >= 8) {
    const last = take((p) => p.obp * 0.6 + p.speed * 0.4);
    slots[n - 1] = last;
    reasons[last.playerId] = "last — second leadoff, turns the order over with runners on";
  }

  const middle = [...remaining]
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.quality - a.quality || a.playerId.localeCompare(b.playerId));
  let mi = 0;
  for (let i = 0; i < n; i++) {
    if (!slots[i]) {
      const p = middle[mi++];
      slots[i] = p;
      if (!(p.playerId in reasons)) reasons[p.playerId] = "by overall quality";
    }
  }

  return { order: slots.map((s) => s!.playerId), reasons };
}
