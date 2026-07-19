# Crushers Blue Team Manager — Goals

Software for running the Crushers Blue, an 11U travel baseball team. One
place for coaches and parents to manage the season: who's on the team, when
and where we play, who's available, how each player is developing, and what
our best lineup looks like — before and during every game.

GameChanger remains the scoring system the travel-ball world runs on; this
app is the **team intelligence layer on top of it**: coach ratings, lineup
optimization, player development, and parent communication that no
off-the-shelf scoring app provides.

It also replaces the Google Sheet the team organizes with today — roster and
contacts, practice RSVPs, tournament availability, helper and snack signups —
so families have one place to look (goal 10).

## Who uses it

| Role          | What they can do                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Coach/manager | Everything: roster, schedule, ratings, position matrix, lineups, pitch counts, stats, reports, announcements         |
| Parent        | See the schedule and their own player's progress and reports, RSVP availability, enter family availability windows, and score a game manually when acting as scorekeeper |
| Player        | Their own page, opened from a parent's device: avatar, goals, recommended practice sessions, self-logged extra workouts, and teammates' goals and effort progress |

Players do not get email accounts or standalone logins — their page opens
through a parent-mediated kid mode (see goal 12).

## Goals

### 1. Roster & schedule (the foundation)

- Player profiles: name, jersey number, positions, bats/throws, birth date,
  school, up to two parents/guardians (name, email, phone), emergency
  contact, and medical notes.
- Roster status per season: full-time or **practice player** — practice
  players appear in practice RSVPs but sit out tournament planning by
  default, mirroring how the team runs today.
- Privacy built in: contact details and medical notes are visible to coaches
  only; parents see the basic roster.
- Season schedule with three event types: practices, single games, and
  tournaments (a weekend of games at one venue), each with location, arrival
  time, opponent, and notes.
- Availability: parents mark their player In / Out / Maybe for each event.
  Coaches see a headcount at a glance and can spot a short-handed game a week
  out instead of at the field.
- The coach view keeps the familiar grid — players × dates with an
  auto-computed headcount row, like the Sheet today — but each family edits
  only its own row.
- Signups, not just RSVPs: parents volunteer for practice-helper slots
  ("bring a glove") and for tournament duties like snacks and drinks,
  per date.

### 2. Coach ratings & player development

- Coaches log in and rate players quickly — a phone form that takes under a
  minute per player — across the major dimensions of baseball performance:
  hitting, fielding, arm strength, speed/baserunning, and baseball IQ, and
  just as importantly the intangibles: **dugout behavior**, **focus on the
  field**, effort, and coachability.
- Ratings can be captured in context — tagged to a practice or a game — and
  every rating is kept as a dated snapshot, so a player's trend over the
  season is visible, not just their latest number.
- Multiple coaches can rate independently; the app shows per-coach ratings
  and the blended view.
- Per-player **development notes** travel with the ratings — like the
  pitching "tendency → cue" notes coaches keep in the Sheet today (e.g.
  "lets arm get in front of body" → "let the arm be pulled by the body").
  Coach-only by default, shareable per note.
- **Aspirational goals** live alongside ratings: each player's season goals
  and the positions they want to play. The rating form surfaces these so
  feedback during practices and games ties back to what the player is
  working toward. Coaches choose which elements are shared with parents and
  which stay in coach-only notes. Shared goals also power the player pages
  (goal 12).

### 3. Position matrix & lineup intelligence (the centerpiece)

- A **player × position ratings matrix** (P, C, 1B, 2B, 3B, SS, LF, CF, RF),
  rated by coaches. Seeded initially by uploading an Excel file; updated in
  the app over time, with history kept so we can see how position ratings
  evolve.
- The initial matrix already exists — a 1–10 player × position sheet in the
  team's Drive folder — so seeding means importing it (Drive or Excel
  upload), not retyping it.
- **Weekend innings allocation**, absorbing the coach's current planning
  spreadsheets: for a tournament weekend (e.g. 4 games × 6 innings = 24
  innings per player), lay out each player's innings across positions and
  bench, verify every position sums to full coverage, and plan pitching
  (innings for the weekend, max per game, which games). Per-game lineups
  draw down the weekend plan, and actuals feed bench-time tracking.
- **Strongest-lineup solver**: from the matrix, the app computes the best
  defensive alignment for the players available that day.
- **Scenario comparison**: pin a decision ("Player A pitches", "Player B
  catches") and the app re-optimizes everyone else, so alternatives can be
  compared side by side before a game.
- **In-game move assistant**: when a change is made on the fly — the first
  baseman moves to catcher — the app walks the dependent decisions: who
  covers first, who backfills them, ranked by the matrix, using only players
  actually at the game.
- **Bench-time tracking**: innings played and sat, per game and season, so
  playing time stays visible and fair.
- Lineups are set before every game (batting order + fielding by inning) and
  edited live during it; the in-game view is the same tool, phone-first.

### 4. The dugout dashboard — game day on one page

A single-page, iPad-first dashboard that runs the whole game from the
dugout:

- **Opens from the schedule**: tap today's game and it pre-loads the
  planned lineup and that day's available players; tap **Start** and the
  game clock begins.
- **Field view**: a baseball diamond with each position labeled by the
  player in it for the current inning, the bench alongside, and the batting
  order down the side. Changes are **drag-and-drop** — field to bench,
  bench to field, position to position — with the goal 3 move assistant
  suggesting the cascade (who backfills whom) and sanity checks blocking
  impossible states.
- **Live counters on every player**: innings on the bench, innings pitched,
  and current pitch count.
- **Real-time pitch counts and score**: whatever the scorekeeper enters in
  the app streams to the dashboard live. A **box score strip at the
  bottom** shows runs by inning, the current inning, and outs.
- **Game clock**: games are 90 minutes from a scheduled start; time
  remaining is always visible, tied to the schedule and the Start button.
- **Pitch Smart compliance (ages 11–12)** wired into every surface: daily
  cap of 85 pitches and required rest days (21–35 pitches → 1 day, 36–50 →
  2, 51–65 → 3, 66+ → 4). The dashboard shows who is eligible to pitch
  today and how many pitches they have left, and warns loudly — including
  during a drag — before a rule would be broken. Limits live in
  configuration, not code.

### 5. Stats — GameChanger stays the scorer, we stay smart

The travel teams we play standardize on GameChanger (and Perfect Game events
on their systems), so we do not ask families to score games in a second app.

- **System of record: GameChanger.** The team's scorekeeper parent scores in
  GC exactly as they do today — one scoring app, live stream and shared
  box scores preserved.
- **Import, don't re-enter**: a coach uploads GameChanger's stats export
  (CSV) into the app periodically; the app maps rows to our roster and
  populates per-game and season stats automatically. Same pattern for
  Perfect Game/DiamondKast exports where available.
- **In-app scoring is the live companion and the fallback**: a parent can
  score a game in the app — GameChanger-style — and everything they enter
  (runs, outs, pitch counts) streams straight to the dugout dashboard
  (goal 4). When GameChanger is also being scored as the league-facing
  record, the in-app role shrinks to a **lightweight dugout feed** — score,
  outs, and pitch counts, a few taps per half-inning — so nobody
  double-scores play-by-play. Full in-app scoring covers scrimmages, events
  without GC, and the escape hatch if we ever leave GC.
- Derived numbers computed automatically: AVG, OBP, SLG, OPS; ERA and WHIP
  on a 6-inning basis. Season totals, leaderboards, and a per-player page
  parents can see.
- Note: GameChanger has no public API, so "auto-populate" means its official
  export uploaded to us (a ~2-minute chore per import), not a live feed.
  Scraping GC is brittle and against its terms — we won't build on that.

### 6. AI-generated monthly parent reports

- Once a month, the app drafts a feedback report per player — written by an
  LLM from that player's coach ratings (including trends, behavior, and
  focus), stats, bench time, and progress toward their aspirational goals.
- **Coach in the loop**: a coach reviews and can edit every report before it
  is published. Nothing AI-written reaches a parent unreviewed.
- Reports publish to the parent's view in the app (their player only), with
  email delivery as an optional later add-on.
- Privacy: the data sent to the AI service is the minimum needed — first
  name, ratings, stats — never contact, medical, or coach-private notes.

### 7. Tournament planning from family availability

- Beyond RSVP-ing to scheduled events, parents enter their family's
  availability for future weekends (a season-long grid of free/busy).
- The app rolls this up into a **best-weekends view**: which fall or spring
  weekends give us the most players, so we sign up for tournaments we can
  actually field a team for.
- Once we register, the tournament goes on the schedule and normal RSVP
  takes over.
- This digitizes the Sheet's tournament-availability tab — same grid
  families already know, including its "we are NOT attending all of these
  dates" planning purpose — with totals computed automatically and practice
  players tracked separately.

### 8. Built to live year after year

- Everything is scoped to a **season** (year + spring/summer/fall + age
  group). The app rolls forward — Crushers Blue 11U becomes 12U — while
  every past season's rosters, ratings, stats, and reports stay browsable.
- Data lives in a durable hosted database from day one; history is a
  feature, not an afterthought.

### 9. Org-ready, team-focused

- The data model supports multiple teams (Crushers Blue today; other
  Crushers teams later) so the whole organization could adopt it.
- The product surface stays single-team for now — no org admin UI until
  it's needed.

### 10. One-stop shop: absorb and retire the organizing Google Sheet

The team currently organizes in a shared Google Sheet ("Crushers 11u BLUE -
Summer 2026"). Every one of its features has a home in the app:

| Sheet feature                                              | Where it lands              |
| ---------------------------------------------------------- | --------------------------- |
| Roster: numbers, birthdays, school, two guardians' contacts | Goal 1 player profiles      |
| Practice RSVP grid with headcount totals                    | Goal 1 availability grid    |
| Parent practice-helper signup                               | Goal 1 signups              |
| Tournament availability grid, incl. practice players        | Goal 7 planning             |
| Snack & drink signup per tournament date                    | Goal 1 signups              |
| Pitching tendency → cue notes                               | Goal 2 development notes    |

- One-time import straight from Google Drive: roster, contacts, and current
  RSVPs/availability land in the database with zero retyping. Player and
  family data goes into the app's database only — never into this code
  repository.
- Once parity is reached, the Sheet is retired to a read-only archive and
  the app is the single source of truth.

### 11. Crushers Blue branding

- The app wears the team's identity: logo and team colors on every screen,
  on the app icon families save to their phones, and on the monthly
  reports.
- Team colors: **Columbia blue** as the primary, with **orange and white**
  as the accents and black for borders/outlines. Exact shades get matched
  to the team logo once it's provided.
- Logo and colors are provided by the team manager and stored as a theme;
  because of goal 9, a future Crushers team gets its own look without code
  changes.

### 12. Player pages — a growth space for the kids

Each player gets a page of their own to check (opened through a parent's
device — kid mode, no child email accounts), built around one question:
**"what can I do today to get closer to my goals?"**

- **Avatar**: build a cool baseball avatar (team-colored caps, jerseys,
  bats, gloves) or upload their own picture. The page should feel like
  *theirs* — ownership is what brings an 11-year-old back.
- **Their page, their look**: pick the background color, border colors, and
  font from kid-friendly presets, and upload a wallpaper — easy dials that
  make the page feel hand-decorated, not configured. Curated presets keep
  every combination readable, and wallpapers are visible only inside the
  team.
- **My goals, as progress bars**: the season's aspirational goals (from
  goal 2) shown as bars that fill from actions the player controls —
  extra practice sessions logged — never from coach judgments.
- **Recommended practice sessions**: a coach-curated drill library mapped
  to goal types ("wants to catch" → blocking and framing sessions; "hit
  with more power" → tee routines), so the page always offers one concrete
  next session. Logging a completed session takes seconds.
- **Extra-workout counter and forgiving streaks**: running totals and
  milestone badges for consistency (5, 10, 25 sessions). No penalty
  states — a missed week pauses a streak, it doesn't shame.
- **Teammates striving together**: players can see each other's goals and
  effort progress bars — listed alphabetically, never ranked — plus
  team-wide totals ("the Crushers logged 40 extra sessions this month")
  and celebrations when a teammate hits an effort milestone.
- **What the page never shows**: coach ratings, rating trends, specific
  coaching feedback, skill comparisons, or rankings of any kind. Critique
  reaches players through coaches in person and parents via reports; this
  page is where motivation lives.
- Design principles for 11-year-olds: effort over outcome,
  self-comparison over peer comparison, encouraging kid-readable copy, and
  always one small, completable next step.

## Out of scope (for now)

- Fees and payment tracking
- Player email accounts or standalone player logins — player pages are
  parent-mediated (goal 12)
- Native iOS/Android apps — the web app must simply work well on phones
- Replacing GameChanger as the league-facing scoring system (our manual
  scoring is a fallback, not a migration)
- Org-wide admin tooling (see goal 9 — model yes, UI later)

## Non-functional goals

- **Phone-first.** Most use happens standing at a field. Every parent flow
  and every game-day flow must work one-handed on a phone.
- **Volunteer-proof.** Managed hosting, no servers to babysit, backups by
  default. No ops burden on a volunteer coach.
- **Private by default.** Kids' data sits behind a login. Parents see only
  their own player's ratings and reports. Nothing is public.
- **Field-proof.** Ballpark connectivity is bad. The dugout dashboard keeps
  working through dropouts — state lives on the device and syncs when the
  connection returns.

## What success looks like

- A coach sets up the roster and a tournament weekend in under 10 minutes.
- A coach rates a player on a phone in under 60 seconds at practice.
- Uploading the initial Excel ratings matrix produces a suggested strongest
  lineup in seconds.
- Opening a scheduled game on the dugout iPad pre-loads the lineup;
  positions confirmed and clock started in under a minute.
- A mid-game "move 1B to C" is one drag: the ranked cascade of dependent
  moves appears instantly, with pitch-eligibility warnings inline.
- The scorekeeper's pitch counts and the box score appear on the dugout
  dashboard within seconds of being entered.
- A GameChanger stats export imports in under 2 minutes with every row
  matched to a player.
- Monthly reports for the whole team are generated, coach-reviewed, and
  published in under 10 minutes.
- A parent can RSVP in two taps, and their availability grid takes under a
  minute to fill for a season.
- The organizing Google Sheet imports in one sitting with zero retyping,
  and nothing it did is lost.
- A four-game weekend's innings allocation balances every position and
  bench slot automatically.
- A player can log an extra practice session in under 15 seconds and watch
  their goal bar move.
- A player can restyle their whole page — colors, font, wallpaper — in
  under a minute.
- Nothing on a player page ever shows a rating, a ranking, or raw coaching
  feedback.
- It is impossible to put an ineligible pitcher on the mound without a
  warning.

## Proposed build approach (to confirm before coding)

- **App**: Next.js + TypeScript + Tailwind, mobile-first; cookie-session
  auth with coach/parent roles.
- **Database**: hosted Postgres (e.g. Supabase) rather than Firebase.
  Rationale: the heart of this app — the ratings matrix, its history, stats
  rollups, multi-season queries — is relational/tabular, and CSV/Excel
  import-export is natural in SQL. Supabase still gives the Firebase-style
  wins (managed hosting, auth, realtime updates for live game day, generous
  free tier). Firebase remains a workable alternative if preferred.
- **AI reports**: generated server-side via the Claude API, coach-reviewed
  before publish.
- **Imports**: one-time Google Drive import of the organizing Sheet and the
  existing position matrix; Excel (.xlsx) upload as the ongoing path for
  matrices; CSV upload for GameChanger exports.
- **Branding**: team logo and colors as a per-team theme (CSS tokens +
  uploaded logo assets), applied app-wide and to reports and the home-screen
  icon.
- **Build order**: (1) foundation — seasons, roster, schedule, auth &
  roles, branding theme, Google Sheet import; (2) ratings + position matrix
  + weekend allocation + lineup solver (the centerpiece); (3) the dugout
  dashboard + pitch safety + live scoring feed; (4) stats import + manual
  entry; (5) AI reports; (6) availability planning & signups; (7) player
  pages with avatars and the drill library.
