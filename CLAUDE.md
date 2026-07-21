# Claude notes — Crushers Blue Team Manager

- **Read GOALS.md first.** It is the agreed product charter (12 goals,
  build order, scope boundaries). Don't re-litigate decisions recorded
  there (GameChanger stays the scorer; Supabase-style Postgres over
  Firebase; no child accounts).
- **Never commit real family data.** Real names/emails/phones arrive only
  via the Import page into `.data/` (gitignored). Seeds and test fixtures
  use fictional names.
- **DB**: Drizzle + PGlite (embedded Postgres). Schema in
  `src/db/schema.ts`; after changing it run `npm run db:generate` and
  commit the new `drizzle/` migration. Keep SQL portable to hosted
  Postgres — no PGlite-only features. `@electric-sql/pglite` must remain in
  `serverExternalPackages` in `next.config.ts` (bundling breaks its WASM).
- **Auth**: coach/parent roles. Anything contact/medical is coach-only —
  enforce in server components/actions, not just UI.
- **Coach-first mode**: the active set is exactly Game day, Roster, and
  the Performance group (matrix / depth chart / feedback / stats /
  reports) — Mike's slim-menu directive. Everything else (weekend,
  practice stations, drills, families, import, schedule, availability,
  players, progress) is parked behind the "Future preview" nav group +
  amber banners, driven by `src/lib/preview.ts`. Parked ≠ deleted —
  pages stay functional and turn back on by editing that file. Parent
  logins exist but were never distributed.
- **Phase 8 simplification (Mike's direction)**: GameChanger records
  games — this app plans and runs the dugout. No score/clock/outs UI.
  The dugout has a coach view (assist island, Pitch Smart) and a
  player-safe "Dugout board" (diamond + batting order only, no ratings
  or suggestions). Lineup lab merged into Game day (⚡ Auto-arrange;
  /lineup redirects). Matrix editing = quick entry only (per-coach,
  initials from login); the blended grid is read-only. Full + hopeful
  players are game-eligible by default; the PRACTICE squad is opt-in
  only (dugout "Not in this game" chips add them; never seeded into
  lineups or batting orders). The coach homepage is
  the four-needs launcher (Game day / Position matrix / Roster / Stats)
  — no schedule hero or parked-page links for coaches; the event hero
  is parent-only.
- **Depth chart (`/depth`, `src/lib/depth.ts`)**: the staff's shared
  "should they play there" roles (primary/secondary/develop/emergency/
  never) per player×position — one chart, any coach taps, distinct from
  ability ratings. Game day suggestions rank on ability × role for the
  dugout's mode dial (Close game / Up big); never = blocked for
  suggestions (manual drags always allowed); position leverage applies
  only in the full-field solver; blank cells are exactly neutral
  (multiplier 1.0) so an unmarked chart behaves like ability-only.
  Pitch Smart still zeroes resting arms at P in auto-arrange. The
  pitching-first game plan (dugout "Pitching plan" panel →
  `planFullGame`) pins a declared arm per inning and solves every
  inning in one pass with a +0.5/inning bench-fairness boost that
  credits bench AND pitched innings (relieved arms return to the field,
  not the pine); batting order is never touched by planning. The plan
  outranks ⚡ Auto-arrange: `autoArrangeField` re-solves each remaining
  inning AROUND that inning's already-written pitcher (shared
  `solveInningsRange` engine), never replacing a planned arm. The
  practice sorter (`/practice`, `src/lib/practice.ts`) splits the
  roster across stations from the same signals (develop spots /
  needs-work primaries / ★ asks / usage), never-cells excluded. The
  roster (coach view) = one expandable card per player: header shows
  jersey/name/status/position chips (depth-chart primaries/secondaries
  with blended ratings, top-3 rated as fallback), the "everything"
  panel holds facts, guardian contacts (mailto/tel), matrix, BARS
  levels, GC season, playing time, and the Edit link; parents see a
  simple list with only the self-reported positions text.
- **Multi-coach dugout**: several coaches run the same game at once, so
  every dugout write is lock-free and conflict-safe — prod speaks Neon
  SQL-over-HTTP (no interactive transactions; keep it that way). Pitch
  counts increment atomically in SQL (never read-then-write); field
  moves stamp `updated_by`/`updated_at` and end with a double-booking
  heal (newest write keeps a slot, the loser is benched visibly);
  batting-order swaps renumber 1..n after writing. Every meaningful
  write logs to `game_edits` with the coach's initials (append-mostly;
  same-coach bursts coalesce via coalesceKey). Game day shows the trail
  strip (coach view only, never the board) and flashes when the 15s
  sync poll pulls in another coach's edit. Rating pages (BARS, quick
  entry) are per-coach append-only tables — safe to use concurrently
  with a live dugout by design.
- **BARS feedback (`src/lib/bars.ts`, `bars_ratings`)**: player feedback
  is criterion-referenced 1–5 (3 = the 11U standard) across D1–D9 + P/C
  role modules, with full behavioral anchors on screen during entry.
  Dimension-first flow at /rate/[dimension]; level 0 = "not observed"
  (never default a 3); append-only rows; display = median of each
  rater's latest, splits ≥2 flagged not averaged. NO composite score or
  player ranking anywhere — keep it that way. Legacy `player_ratings`
  stays as history. Reports live under Performance, pull BARS + anchors
  + next-level targets + GC stats + playing time, and always include
  the scale explanation (`BARS_SCALE_EXPLANATION`).
- **Homework (`/homework`, `src/lib/homework.ts`)**: under Performance —
  feedback's second half. The researched drill catalog lives in code
  (`HOMEWORK_CATALOG`): every drill traces to a named public source
  (instructions rewritten in our own words, never copied), keyed per
  BARS dimension, diagrams in `DrillDiagram.tsx`. Gaps = observed
  medians < 3 (worst first; the self-regulation dims D6–D9 count like
  any skill; P/C modules only for kids with a matching depth-chart
  role; unrated dimensions are never gaps), rounded out with lowest-
  observed "level-up" picks so every rated kid gets work. Assignments
  (`homework_assignments`) reference drills by stable key — never
  rename a shipped key. ⚡ auto-assign (per player + whole team) writes
  each kid's top gap-matched drills, position-aware via depth-chart
  primaries/secondaries (`suggestForPlayer`); the Team focus panel
  aggregates shared gaps (counts only, ≥2 kids below standard) with
  one-tap team themes; `searchCatalog` powers the find-a-drill box;
  /homework/print renders per-player handouts with a 4-week practice
  log (minutes + parent initials) — print CSS in globals.css. The
  /drills starter set derives from the catalog. Player cards stay in
  roster order — no ranking, ever.
- **Types over enums**: text columns typed with `$type<...>()` unions.
- **Theme**: tokens in `src/app/globals.css` (`--color-team-*`); Columbia
  blue primary, orange accent, black borders. Exact shades pending the team
  logo.
- **Verify**: `npm test`, `npm run build`, and `node scripts/smoke.mjs`
  against a seeded `npm run dev` server (uses `/opt/pw-browsers/chromium`
  via `CHROMIUM_PATH` in this environment). If `.data/pglite` holds real
  team data, never wipe `.data/` — seed and run the smoke against a demo
  dir instead: `PGLITE_DATA_DIR=.data/demo-pglite` for both seed and dev
  (smoke expects a fresh demo seed).
