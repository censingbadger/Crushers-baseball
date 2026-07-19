# Deploying Crushers Blue (Netlify + Netlify DB)

One-time setup, roughly ten minutes. You need only your GitHub account.

## 1. Create the site

1. Go to <https://app.netlify.com> and **sign in with GitHub**.
2. **Add new project → Import an existing project → GitHub** and pick
   `censingbadger/Crushers-baseball`.
3. Accept the detected build settings (`npm run build`; the Next.js runtime
   is picked up from `netlify.toml`). Deploy.

## 2. Add the database

1. In the site's dashboard: **Extensions / Storage → Database → Add**.
   This provisions a Postgres database (powered by Neon) and injects
   `NETLIFY_DATABASE_URL` into the site's environment automatically.
2. The app runs its migrations itself on first boot — no manual SQL step.

## 3. Set the session secret

**Site configuration → Environment variables → Add**:

- `AUTH_SECRET` — any long random string (e.g. run
  `openssl rand -base64 32`). This signs login cookies; required in
  production.

Redeploy after adding it (Deploys → Trigger deploy).

## 4. Load the real team

From a machine with the repo and the import files in `.data/imports/`
(see `scripts/import-real.ts` for the file list):

```bash
DATABASE_URL="<the NETLIFY_DATABASE_URL value>" npm run import:real
```

The same script that loads the local database loads the hosted one —
roster, parent accounts, practices, RSVPs, availability, cues, and the
matrix. Temp passwords land in `.data/imports/credentials.txt`; hand each
family theirs.

## 5. Done

Every merge to `main` now deploys automatically. The site URL can be
renamed (Site configuration → Site details) to something like
`crushersblue.netlify.app`.

## Notes

- Local development is unchanged: no `DATABASE_URL` → embedded PGlite in
  `.data/`, `npm run seed` for fictional demo data.
- Keep real family data out of the repository — it lives in the deployed
  database and the gitignored `.data/` only.
