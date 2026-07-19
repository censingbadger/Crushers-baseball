# Crushers Blue Team Manager

One place for the coaches, parents, and players of the Crushers Blue (11U
travel baseball) to run the season: roster, schedule, availability, lineups,
stats, and player development. The product vision lives in
[GOALS.md](./GOALS.md).

## Status

Phase 1 (foundation) is built:

- **Auth & roles** — email/password login with signed session cookies; coach
  and parent roles with coach-only data (guardian contacts, medical fields)
  enforced server-side.
- **Seasons & roster** — season-scoped roster with jersey numbers, full-time
  vs practice players, positions, school, and guardians.
- **Schedule & RSVPs** — practices, games, and tournaments; In/Maybe/Out
  answers with live headcounts; parents answer for their own players only.
- **Signups** — practice-helper and snack/drink volunteering per event.
- **Availability grids** — the organizing Sheet's grids, digitized: every
  player × every event, plus tournament-weekend family availability with
  color-coded totals.
- **Sheet import** — CSV importers for the organizing Google Sheet's Roster,
  Practice RSVP, and Tournament Availability tabs (idempotent; creates
  parent accounts with one-time temp passwords).
- **Team theme** — Columbia blue / orange / white with black borders
  (placeholder shades until the logo is matched).

Later phases (see GOALS.md): ratings & position matrix, lineup solver and
weekend innings allocation, the dugout dashboard with Pitch Smart warnings,
GameChanger stats import, AI monthly parent reports, availability planning,
and player pages with guided workouts.

## Development

```bash
npm install
npm run seed     # demo team + logins (fictional data)
npm run dev      # http://localhost:3000
```

Demo logins (printed by the seed):

- Coach: `coach@demo.crushersblue.example` / `dugout-demo`
- Parent: `parent@demo.crushersblue.example` / `family-demo`

Other commands:

```bash
npm test             # vitest unit tests (importers, sessions)
npm run build        # production build
npm run db:generate  # regenerate Drizzle migrations after schema changes
node scripts/smoke.mjs  # browser smoke test against a running dev server
```

## Architecture

- **Next.js 16 (App Router) + TypeScript + Tailwind v4**, server components
  and server actions — no separate API layer.
- **Drizzle ORM on embedded Postgres (PGlite)** persisted to `.data/pglite`.
  Dev and tests need no external database, while the SQL stays
  hosted-Postgres compatible for the planned Supabase deployment (swap the
  driver, keep the schema).
- **Sessions** are HMAC-signed cookies (`src/lib/session.ts`); passwords are
  bcrypt hashes. Set `AUTH_SECRET` in production.
- **Importers** (`src/lib/importers/`) are pure functions over CSV text with
  unit tests — the server actions in `src/app/import/` handle persistence.

## Data & privacy

Real roster/contact data enters through the Import page into the local
database only. The repository contains fictional seed data and synthetic
test fixtures — never real family information.
