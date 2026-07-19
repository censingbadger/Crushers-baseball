# Crushers Blue Team Manager — Goals

Software for running the Crushers Blue, an 11U travel baseball team. One
place for coaches and parents to manage the season: who's on the team, when
and where we play, who's available, how each player is developing, and what
our best lineup looks like — before and during every game.

GameChanger remains the scoring system the travel-ball world runs on; this
app is the **team intelligence layer on top of it**: coach ratings, lineup
optimization, player development, and parent communication that no
off-the-shelf scoring app provides.

## Who uses it

| Role          | What they can do                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Coach/manager | Everything: roster, schedule, ratings, position matrix, lineups, pitch counts, stats, reports, announcements         |
| Parent        | See the schedule and their own player's progress and reports, RSVP availability, enter family availability windows, and score a game manually when acting as scorekeeper |

Players do not get their own logins (see "Out of scope").

## Goals

### 1. Roster & schedule (the foundation)

- Player profiles: name, jersey number, positions, bats/throws, birth date,
  parent/guardian contacts, emergency contact, and medical notes.
- Privacy built in: contact details and medical notes are visible to coaches
  only; parents see the basic roster.
- Season schedule with three event types: practices, single games, and
  tournaments (a weekend of games at one venue), each with location, arrival
  time, opponent, and notes.
- Availability: parents mark their player In / Out / Maybe for each event.
  Coaches see a headcount at a glance and can spot a short-handed game a week
  out instead of at the field.

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
- **Aspirational goals** live alongside ratings: each player's season goals
  and the positions they want to play. The rating form surfaces these so
  feedback during practices and games ties back to what the player is
  working toward. Coaches choose which elements are shared with parents and
  which stay in coach-only notes.

### 3. Position matrix & lineup intelligence (the centerpiece)

- A **player × position ratings matrix** (P, C, 1B, 2B, 3B, SS, LF, CF, RF),
  rated by coaches. Seeded initially by uploading an Excel file; updated in
  the app over time, with history kept so we can see how position ratings
  evolve.
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

### 4. Game-day execution & pitch safety

- The pre-game lineup (seeded by the solver, adjusted by the coach) becomes
  the live game-day view: current inning, who's where, who's on the bench.
- Sanity checks: no one in two spots, no position left empty.
- Pitch count log: a couple of taps per half-inning from the dugout.
- Pitch Smart compliance (ages 11–12): daily cap of 85 pitches and required
  rest days (21–35 pitches → 1 day, 36–50 → 2, 51–65 → 3, 66+ → 4). The app
  shows who is eligible to pitch today and how many pitches they have left,
  and warns loudly — including inside the move assistant — before a rule
  would be broken. Limits live in configuration, not code.

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
- **Manual scoring as the fallback**: parents can enter a game's stats by
  hand in the app — GameChanger-style — for scrimmages, practices, events
  with no GC scoring, or if we ever choose to leave GC. This is the fallback
  and the escape hatch, not the primary path.
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

## Out of scope (for now)

- Fees and payment tracking
- Player logins
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

## What success looks like

- A coach sets up the roster and a tournament weekend in under 10 minutes.
- A coach rates a player on a phone in under 60 seconds at practice.
- Uploading the initial Excel ratings matrix produces a suggested strongest
  lineup in seconds.
- A mid-game "move 1B to C" shows the ranked cascade of dependent moves
  instantly, with pitch-eligibility warnings inline.
- A GameChanger stats export imports in under 2 minutes with every row
  matched to a player.
- Monthly reports for the whole team are generated, coach-reviewed, and
  published in under 10 minutes.
- A parent can RSVP in two taps, and their availability grid takes under a
  minute to fill for a season.
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
- **Imports**: Excel (.xlsx) upload for the initial ratings matrix; CSV
  upload for GameChanger exports.
- **Build order**: (1) foundation — seasons, roster, schedule, auth &
  roles; (2) ratings + position matrix + lineup solver (the centerpiece);
  (3) game-day execution + pitch safety; (4) stats import + manual entry;
  (5) AI reports; (6) availability planning.
