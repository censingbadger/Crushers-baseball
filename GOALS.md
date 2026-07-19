# Crushers Blue Team Manager — Goals

Software for running the Crushers Blue, an 11U/12U travel baseball team. One
place for coaches and parents to manage the season: who's on the team, when
and where we play, who's available, and how the team is performing.

## Who uses it

| Role          | What they can do                                                                  |
| ------------- | --------------------------------------------------------------------------------- |
| Coach/manager | Everything: roster, schedule, lineups, pitch counts, stats entry, announcements    |
| Parent        | View schedule and roster, RSVP their player's availability, see stats              |

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

### 2. Game-day tools

- Lineup builder: batting order plus fielding positions by inning, with
  sanity checks (no one in two spots, no position left empty) and bench-time
  visibility so playing time stays fair.
- Pitch count log: record pitches per pitcher as the game happens, from a
  phone in the dugout.
- Pitch Smart compliance (ages 11–12): daily cap of 85 pitches and required
  rest days (21–35 pitches → 1 day, 36–50 → 2, 51–65 → 3, 66+ → 4). The app
  shows who is eligible to pitch today and how many pitches they have left,
  and warns loudly before a rule would be broken. Limits live in
  configuration, not code, in case league rules differ.

### 3. Stats

- Per-game box score entry: batting (AB, R, H, 2B, 3B, HR, RBI, BB, K, SB,
  HBP) and pitching (IP, batters faced, pitches, H, R, ER, BB, K).
- Derived numbers computed automatically: AVG, OBP, SLG, OPS; ERA and WHIP on
  a 6-inning game basis.
- Season totals, simple leaderboards, and a per-player page parents can see.

## Out of scope (for now)

- Fees and payment tracking
- Player logins
- Native iOS/Android apps — the web app must simply work well on phones
- Multi-team/league management — this is for one team, though nothing in the
  design should prevent adding, say, a Crushers Red later

## Non-functional goals

- **Phone-first.** Most use happens standing at a field. Every parent flow
  and every game-day flow must work one-handed on a phone.
- **Volunteer-proof.** One small service with a single-file database, easy to
  host and back up. No ops burden on a volunteer coach.
- **Private by default.** Kids' data sits behind a login. Nothing is public.

## What success looks like

- A coach sets up the roster and a tournament weekend in under 10 minutes.
- A parent can RSVP in two taps from their phone.
- A coach runs a game entirely from a phone: lineup and pitch counts, live.
- Entering a box score after a game takes under 5 minutes, and season stats
  update instantly.
- It is impossible to put an ineligible pitcher on the mound without a
  warning.

## Proposed build approach (to confirm before coding)

Full-stack TypeScript web app: Next.js + Tailwind for a mobile-first UI,
SQLite for storage (one file, trivial backups), cookie-session auth with two
roles (coach, parent). Build in the order of the goals above: roster &
schedule first, then game-day tools, then stats.
