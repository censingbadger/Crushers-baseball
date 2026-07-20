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
- **Coach-first mode**: the active tool is ratings/lineups/dugout/stats;
  family-facing features (schedule, availability, players, progress,
  reports) are parked behind the "Future preview" nav group + amber
  banners, driven by `src/lib/preview.ts`. Don't delete parked features —
  they turn back on by editing that file. Parent logins exist but were
  never distributed.
- **Phase 8 simplification (Mike's direction)**: GameChanger records
  games — this app plans and runs the dugout. No score/clock/outs UI.
  The dugout has a coach view (assist island, Pitch Smart) and a
  player-safe "Dugout board" (diamond + batting order only, no ratings
  or suggestions). Lineup lab merged into Game day (⚡ Auto-arrange;
  /lineup redirects). Matrix editing = quick entry only (per-coach,
  initials from login); the blended grid is read-only. All roster
  statuses (practice/hopeful) are game-eligible. The coach homepage is
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
  practice sorter (`/practice`, `src/lib/practice.ts`) splits the
  roster across stations from the same signals (develop spots /
  needs-work primaries / ★ asks / usage), never-cells excluded. The
  roster's Positions column = depth-chart primaries/secondaries with
  blended ratings (top-3 rated as fallback); parents see only the
  self-reported text.
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
