import type { DiagramKind } from "@/lib/homework";

// Small instructional diagrams for homework drills. Deliberately abstract
// — positions, paths, and the one spatial idea each drill hinges on —
// with the team palette. Each is a pure SVG, server-rendered.

const INK = "#2a2622";
const BLUE = "#9BCBEB";
const BLUE_DARK = "#4a7fa5";
const ORANGE = "#F97316";
const DIRT = "#c99054";
const GRASS = "#43974f";

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="8" fontWeight="700" fill={INK}>
      {children}
    </text>
  );
}

function Arrow({ d, color = ORANGE, dash }: { d: string; color?: string; dash?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeDasharray={dash ? "4 3" : undefined}
      markerEnd="url(#hw-arrow)"
    />
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 220 130"
      role="img"
      aria-label={title}
      className="h-auto w-full max-w-sm rounded-lg border border-line bg-[#f7f4ec]"
    >
      <defs>
        <marker id="hw-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0,0 L6,3.5 L0,7 Z" fill="context-stroke" />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

function TeeZones() {
  return (
    <Frame title="Tee positions: away pitch deep, middle even with front hip, inside pitch out front">
      {/* home plate, batter's box view from above; pitcher is up */}
      <path d="M 95 105 h 30 v 8 l -15 10 l -15 -10 Z" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <Label x={110} y={100}>home plate · pitcher ↑</Label>
      {/* batter silhouette spot (right-handed, left of plate) */}
      <circle cx={70} cy={112} r="6" fill={BLUE} stroke={INK} />
      <Label x={70} y={128}>you</Label>
      {/* three tee spots */}
      <circle cx={130} cy={92} r="7" fill={ORANGE} stroke={INK} strokeWidth="1.5" />
      <Label x={152} y={88} anchor="start">INSIDE —</Label>
      <Label x={152} y={97} anchor="start">out front</Label>
      <circle cx={110} cy={72} r="7" fill={ORANGE} stroke={INK} strokeWidth="1.5" />
      <Label x={110} y={58}>MIDDLE — even with front hip</Label>
      <circle cx={92} cy={94} r="7" fill={ORANGE} stroke={INK} strokeWidth="1.5" />
      <Label x={66} y={84} anchor="middle">AWAY —</Label>
      <Label x={62} y={93} anchor="middle">deeper,</Label>
      <Label x={62} y={102} anchor="middle">hit it late</Label>
      {/* intended ball flight arrows */}
      <Arrow d="M 130 84 C 140 60 150 40 165 22" />
      <Arrow d="M 110 64 C 110 45 110 32 110 16" />
      <Arrow d="M 92 86 C 75 60 62 40 50 22" />
      <Label x={166} y={14} anchor="middle">pull</Label>
      <Label x={110} y={10}>middle</Label>
      <Label x={50} y={14}>oppo</Label>
    </Frame>
  );
}

function WallBall() {
  return (
    <Frame title="Wall ball: throw low against a wall, field the rebound out front with soft hands">
      <rect x="180" y="15" width="14" height="100" fill={DIRT} stroke={INK} />
      <Label x={187} y={10}>wall</Label>
      <rect x="10" y="108" width="184" height="8" fill={GRASS} />
      {/* player */}
      <circle cx={45} cy={78} r="7" fill={BLUE} stroke={INK} />
      <path d="M 45 85 L 45 100 M 45 90 L 33 98 M 45 90 L 58 96 M 45 100 L 38 110 M 45 100 L 53 110" stroke={INK} strokeWidth="2" fill="none" />
      <Label x={45} y={126}>athletic stance, glove out front</Label>
      {/* throw and rebound */}
      <Arrow d="M 58 88 C 110 78 150 82 179 92" />
      <Arrow d="M 179 98 C 140 104 100 106 62 102" color={BLUE_DARK} />
      <Label x={118} y={72}>throw LOW</Label>
      <Label x={118} y={100}>rebound = grounder</Label>
    </Frame>
  );
}

function ShortHop() {
  return (
    <Frame title="Short hops: partner bounces the ball just in front of the glove; work through it, don't stab back">
      <rect x="10" y="108" width="200" height="8" fill={DIRT} />
      {/* partner */}
      <circle cx={30} cy={70} r="7" fill={BLUE} stroke={INK} />
      <path d="M 30 77 L 30 96 M 30 82 L 44 88" stroke={INK} strokeWidth="2" fill="none" />
      <Label x={30} y={126}>partner tosses</Label>
      {/* fielder kneeling, glove out front */}
      <circle cx={172} cy={74} r="7" fill={BLUE} stroke={INK} />
      <path d="M 172 81 L 172 96 L 160 108 M 172 96 L 184 108 M 172 86 L 152 96" stroke={INK} strokeWidth="2" fill="none" />
      <circle cx={149} cy={97} r="5" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <Label x={170} y={126}>glove OUT FRONT, work forward</Label>
      {/* ball path with bounce right before glove */}
      <Arrow d="M 44 86 C 90 88 120 96 138 106 L 148 99" />
      <circle cx={138} cy={106} r="2.5" fill={ORANGE} />
      <Label x={120} y={62}>bounce lands just before the glove</Label>
      <Arrow d="M 120 66 C 130 78 134 92 137 102" color={BLUE_DARK} dash />
    </Frame>
  );
}

function ThrowingLane() {
  return (
    <Frame title="Accuracy throws: feet and shoulders aligned to a chest-high target square">
      {/* overhead view: feet, alignment line, target on wall */}
      <rect x="186" y="30" width="10" height="80" fill={DIRT} stroke={INK} />
      <rect x="176" y="55" width="10" height="26" fill="none" stroke={ORANGE} strokeWidth="2.5" />
      <Label x={168} y={50} anchor="end">chest-high target</Label>
      {/* feet (overhead ovals) aligned to target */}
      <ellipse cx={38} cy={62} rx="5" ry="10" fill={BLUE} stroke={INK} transform="rotate(80 38 62)" />
      <ellipse cx={62} cy={74} rx="5" ry="10" fill={BLUE} stroke={INK} transform="rotate(80 62 74)" />
      <Label x={46} y={94}>back foot · front foot</Label>
      <Label x={46} y={104}>both point sideways to target</Label>
      {/* alignment + throw */}
      <Arrow d="M 30 68 L 172 68" color={BLUE_DARK} dash />
      <Arrow d="M 70 68 C 110 58 140 60 174 66" />
      <Label x={112} y={44}>shoulders stay on this line</Label>
    </Frame>
  );
}

function RoundingFirst() {
  return (
    <Frame title="Rounding first: swing out before the bag, cut the inside corner, eyes on second">
      <rect x="10" y="10" width="200" height="110" fill={GRASS} />
      {/* basepath home (bottom right) to first (top right)? classic diagram: home bottom-left */}
      <path d="M 30 110 h 14 v 6 l -7 5 l -7 -5 Z" fill="#fff" stroke={INK} />
      <Label x={37} y={104}>home</Label>
      <rect x={176} y={96} width="11" height="11" fill="#fff" stroke={INK} transform="rotate(45 181 101)" />
      <Label x={181} y={86}>1B</Label>
      <rect x={176} y={20} width="11" height="11" fill="#fff" stroke={INK} transform="rotate(45 181 25)" />
      <Label x={181} y={44}>2B</Label>
      {/* straight-through line (faded) */}
      <Arrow d="M 46 108 L 172 102" color={BLUE_DARK} dash />
      <Label x={100} y={124}>straight through on a single? no —</Label>
      {/* banana path */}
      <Arrow d="M 46 106 C 90 96 118 80 140 84 C 160 88 172 96 178 99 L 181 74" />
      <Label x={104} y={70}>swing out early…</Label>
      <Label x={148} y={112}>…hit the INSIDE corner, push off toward 2B</Label>
    </Frame>
  );
}

function TowelDrill() {
  return (
    <Frame title="Towel drill: full delivery, snap the towel at a target a stride past your stride foot">
      <rect x="10" y="108" width="200" height="8" fill={DIRT} />
      {/* pitcher mid-stride */}
      <circle cx={60} cy={40} r="7" fill={BLUE} stroke={INK} />
      <path d="M 60 47 L 64 72 L 46 92 M 64 72 L 92 100 M 60 52 L 40 60 M 60 52 L 82 38" stroke={INK} strokeWidth="2" fill="none" />
      <path d="M 82 38 L 96 28" stroke={ORANGE} strokeWidth="3" />
      <Label x={100} y={22} anchor="start">towel in hand</Label>
      <Label x={56} y={126}>full windup, stride, finish</Label>
      {/* target: partner's glove / chair */}
      <rect x={150} y={82} width="20" height="26" fill="none" stroke={INK} strokeWidth="2" />
      <circle cx={160} cy={78} r="6" fill="#fff" stroke={INK} strokeWidth="2" />
      <Label x={160} y={126}>glove or chair, one stride past front foot</Label>
      <Arrow d="M 98 30 C 124 44 144 62 158 74" />
      <Label x={140} y={40}>snap DOWN at it</Label>
    </Frame>
  );
}

function CatcherBlock() {
  return (
    <Frame title="Blocking: drop to both knees, chest over the ball, chin tucked — smother, don't catch">
      <rect x="10" y="108" width="200" height="8" fill={DIRT} />
      {/* incoming pitch into dirt */}
      <Arrow d="M 16 50 C 60 62 100 84 122 104" />
      <circle cx={122} cy={104} r="3" fill={ORANGE} />
      <Label x={54} y={40}>ball in the dirt</Label>
      {/* catcher on knees, rounded over */}
      <circle cx={158} cy={58} r="7" fill={BLUE} stroke={INK} />
      <path d="M 158 65 C 150 74 144 84 142 96 L 150 108 M 158 65 C 166 76 170 88 172 100 L 164 108" stroke={INK} strokeWidth="2" fill="none" />
      <path d="M 142 96 Q 158 88 172 100" stroke={INK} strokeWidth="2" fill="none" />
      <Label x={158} y={126}>both knees down, chest OVER the ball</Label>
      {/* deadened rebound */}
      <Arrow d="M 130 104 L 138 100" color={BLUE_DARK} dash />
      <Label x={196} y={52} anchor="end">chin tucked</Label>
    </Frame>
  );
}

function RoutineLoop() {
  return (
    <Frame title="Pre-pitch routine: breath, cue word, eyes to a small target — the same loop every pitch">
      <circle cx={110} cy={65} r="44" fill="none" stroke={BLUE_DARK} strokeWidth="2" strokeDasharray="5 4" />
      <Arrow d="M 110 21 A 44 44 0 0 1 149 46" color={ORANGE} />
      <Arrow d="M 152 78 A 44 44 0 0 1 118 108" color={ORANGE} />
      <Arrow d="M 70 86 A 44 44 0 0 1 68 52" color={ORANGE} />
      <rect x={80} y={6} width="60" height="16" rx="8" fill={BLUE} stroke={INK} />
      <Label x={110} y={17}>1 · big breath</Label>
      <rect x={142} y={52} width="72" height="16" rx="8" fill={BLUE} stroke={INK} />
      <Label x={178} y={63}>2 · cue word</Label>
      <rect x={8} y={78} width="88" height="16" rx="8" fill={BLUE} stroke={INK} />
      <Label x={52} y={89}>3 · eyes to target</Label>
      <Label x={110} y={62}>same loop,</Label>
      <Label x={110} y={73}>every pitch</Label>
    </Frame>
  );
}

const DIAGRAMS: Record<DiagramKind, () => React.ReactNode> = {
  "tee-zones": TeeZones,
  "wall-ball": WallBall,
  "short-hop": ShortHop,
  "throwing-lane": ThrowingLane,
  "rounding-first": RoundingFirst,
  "towel-drill": TowelDrill,
  "catcher-block": CatcherBlock,
  "routine-loop": RoutineLoop,
};

export function DrillDiagram({ kind }: { kind: DiagramKind }) {
  const Diagram = DIAGRAMS[kind];
  return Diagram ? <>{Diagram()}</> : null;
}
