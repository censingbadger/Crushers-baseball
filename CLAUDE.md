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
- **Types over enums**: text columns typed with `$type<...>()` unions.
- **Theme**: tokens in `src/app/globals.css` (`--color-team-*`); Columbia
  blue primary, orange accent, black borders. Exact shades pending the team
  logo.
- **Verify**: `npm test`, `npm run build`, and `node scripts/smoke.mjs`
  against a seeded `npm run dev` server (uses `/opt/pw-browsers/chromium`
  via `CHROMIUM_PATH` in this environment).
