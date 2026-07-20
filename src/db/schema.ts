import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Roles, statuses, and kinds are plain text columns constrained by TypeScript
// unions so the schema stays portable between PGlite (dev) and hosted
// Postgres (prod).
export type UserRole = "coach" | "parent";
export type SeasonTerm = "spring" | "summer" | "fall";
// full = regular roster; practice = practices only (never in game lineups);
// hopeful = prospective player being evaluated.
export type RosterStatus = "full" | "practice" | "hopeful";
export type EventType = "practice" | "game" | "tournament";
export type RsvpStatus = "yes" | "no" | "maybe";
export type SignupKind = "helper" | "snacks" | "drinks";

export const POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"] as const;
export type Position = (typeof POSITIONS)[number];

// Rating dimensions for the quick coach forms (goal 2): the ball-skills
// plus the intangibles the team manager called out explicitly.
export type RatingDimension =
  | "hitting"
  | "fielding"
  | "arm"
  | "speed"
  | "iq"
  | "dugout"
  | "focus"
  | "effort"
  | "coachability";
export type RatingContext = "practice" | "game" | "general";
export type DevNoteCategory = "pitching" | "hitting" | "fielding" | "general";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Theme (goal 11): Columbia blue primary, orange + white accents, black borders.
  primaryColor: text("primary_color").notNull().default("#9BCBEB"),
  accentColor: text("accent_color").notNull().default("#F97316"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    year: integer("year").notNull(),
    term: text("term").$type<SeasonTerm>().notNull(),
    ageGroup: text("age_group").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("seasons_team_year_term").on(t.teamId, t.year, t.term)],
);

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthdate: date("birthdate"),
  school: text("school"),
  bats: text("bats"),
  throws: text("throws"),
  // Coach-only fields (enforced in the UI/data-access layer).
  emergencyContact: text("emergency_contact"),
  medicalNotes: text("medical_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    jerseyNumber: integer("jersey_number"),
    status: text("status").$type<RosterStatus>().notNull().default("full"),
    positions: text("positions"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roster_season_player").on(t.seasonId, t.playerId)],
);

export const guardians = pgTable("guardians", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playerGuardians = pgTable(
  "player_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
  },
  (t) => [uniqueIndex("player_guardian_once").on(t.playerId, t.guardianId)],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  role: text("role").$type<UserRole>().notNull(),
  guardianId: uuid("guardian_id").references(() => guardians.id),
  // Bumped on password change / access revoke: session cookies carry the
  // epoch they were issued under, so old cookies die immediately.
  sessionEpoch: integer("session_epoch").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  type: text("type").$type<EventType>().notNull(),
  title: text("title"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  arrivalAt: timestamp("arrival_at"),
  location: text("location"),
  opponent: text("opponent"),
  notes: text("notes"),
  // Tournament games will point at their tournament event in later phases.
  parentEventId: uuid("parent_event_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rsvps = pgTable(
  "rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    status: text("status").$type<RsvpStatus>().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rsvp_event_player").on(t.eventId, t.playerId)],
);

export const signups = pgTable("signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  kind: text("kind").$type<SignupKind>().notNull(),
  guardianName: text("guardian_name").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Player-by-position skill ratings (goal 3's matrix). Append-only: the
// current matrix is the latest row per (season, player, position, rater),
// and older rows are the history. `rater` is a coach label (e.g. "MC"),
// mirroring the per-coach sheets of the original Excel workbook.
export const positionRatings = pgTable("position_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  position: text("position").$type<Position>().notNull(),
  rating: integer("rating").notNull(),
  rater: text("rater").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Quick coach ratings (goal 2): 1–5 per dimension, append-only so every
// snapshot is dated and trends are visible. Tagged with context (practice /
// game / general) and the rating coach's label, like the position matrix.
export const playerRatings = pgTable("player_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  dimension: text("dimension").$type<RatingDimension>().notNull(),
  rating: integer("rating").notNull(),
  context: text("context").$type<RatingContext>().notNull().default("general"),
  note: text("note"),
  /** The day the feedback is FOR (a coach can log Tuesday's practice on
   * Wednesday); createdAt stays the bookkeeping timestamp. */
  day: date("day"),
  rater: text("rater").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Development notes (goal 2): the "tendency → cue" pairs coaches keep.
// Coach-only unless shared — shared cues surface on the parent progress
// view (and the player pages in phase 7).
export const devNotes = pgTable("dev_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  category: text("category").$type<DevNoteCategory>().notNull().default("general"),
  tendency: text("tendency").notNull(),
  cue: text("cue").notNull(),
  shared: boolean("shared").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Aspirational goals (goal 2): per player per season. Desired positions and
// season goals are shared with the family by design; coach notes are not.
export const aspirations = pgTable(
  "aspirations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    desiredPositions: text("desired_positions"),
    seasonGoals: text("season_goals"),
    coachNotes: text("coach_notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("aspiration_once").on(t.seasonId, t.playerId)],
);

// Depth-chart roles: the staff's shared "should they play there" call per
// player+position — distinct from ability ratings, which say how WELL
// they'd play it. A blank cell simply has no row.
export const POSITION_ROLES = [
  "primary",
  "secondary",
  "develop",
  "emergency",
  "never",
] as const;
export type PositionRoleKind = (typeof POSITION_ROLES)[number];

// BARS development ratings (the instrument lives in src/lib/bars.ts):
// criterion-referenced 1–5 per dimension, level 0 = "not observed"
// (first-class — never defaulted). Append-only: every row is kept so
// trends and rater history stay auditable; display uses each rater's
// latest observed level, medianed across raters. The legacy 1–10
// player_ratings table remains as history.
export const barsRatings = pgTable(
  "bars_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    dimension: text("dimension").$type<import("@/lib/bars").BarsKey>().notNull(),
    rater: text("rater").notNull(),
    level: integer("level").notNull(), // 1-5, 0 = not observed
    day: date("day").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("bars_season_dim").on(t.seasonId, t.dimension)],
);

export const positionRoles = pgTable(
  "position_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    position: text("position").$type<Position>().notNull(),
    role: text("role").$type<PositionRoleKind>().notNull(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("position_role_once").on(t.seasonId, t.playerId, t.position),
  ],
);

// Weekend innings allocation (goal 3): plan each player's innings across a
// tournament weekend before drawing per-game lineups. Mirrors the coach's
// planning spreadsheet: two field positions plus pitching innings per
// player; bench is derived. One plan per tournament event.
export const weekendPlans = pgTable("weekend_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => events.id),
  games: integer("games").notNull().default(4),
  inningsPerGame: integer("innings_per_game").notNull().default(6),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const weekendPlanLines = pgTable(
  "weekend_plan_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weekendPlans.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    posA: text("pos_a").$type<Position>(),
    inningsA: integer("innings_a").notNull().default(0),
    posB: text("pos_b").$type<Position>(),
    inningsB: integer("innings_b").notNull().default(0),
    pitchInnings: integer("pitch_innings").notNull().default(0),
    pitchMaxPerGame: integer("pitch_max_per_game"),
    pitchGames: text("pitch_games"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_player_once").on(t.planId, t.playerId)],
);

// Live game day (goal 4): one row per game run from the dugout dashboard.
// Games belong to a schedule event (a game event, or a tournament that
// contains several games).
export type GameStatus = "setup" | "live" | "final";

export const liveGames = pgTable("live_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  label: text("label").notNull(),
  opponent: text("opponent"),
  status: text("status").$type<GameStatus>().notNull().default("setup"),
  innings: integer("innings").notNull().default(6),
  clockMinutes: integer("clock_minutes").notNull().default(90),
  startedAt: timestamp("started_at"),
  currentInning: integer("current_inning").notNull().default(1),
  outs: integer("outs").notNull().default(0),
  gameDate: date("game_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Where each player is, per inning. position is a fielding position or
// "BENCH". A move in inning N rewrites innings N..end, so bench/played
// innings fall straight out of this table.
export const gameAssignments = pgTable(
  "game_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => liveGames.id),
    inning: integer("inning").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    position: text("position").notNull(), // Position | "BENCH"
  },
  (t) => [uniqueIndex("assignment_once").on(t.gameId, t.inning, t.playerId)],
);

export const battingOrders = pgTable(
  "batting_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => liveGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    spot: integer("spot").notNull(),
  },
  (t) => [uniqueIndex("batting_spot_once").on(t.gameId, t.playerId)],
);

export const scoreLines = pgTable(
  "score_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => liveGames.id),
    inning: integer("inning").notNull(),
    side: text("side").$type<"us" | "them">().notNull(),
    runs: integer("runs").notNull().default(0),
  },
  (t) => [uniqueIndex("score_once").on(t.gameId, t.inning, t.side)],
);

// Pitches thrown per pitcher per inning. Daily totals and Pitch Smart rest
// days are computed from this joined to the game date.
export const pitchCounts = pgTable(
  "pitch_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => liveGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    inning: integer("inning").notNull(),
    pitches: integer("pitches").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pitch_once").on(t.gameId, t.playerId, t.inning)],
);

// Stats (goal 5). GameChanger stays the scorer; its season export imports
// as a replaceable snapshot, while manual box scores cover scrimmages and
// events without GC. Innings pitched are stored as outs to avoid the
// "3.2 innings" decimal trap.
export type StatSource = "gc" | "manual";

export const statGames = pgTable("stat_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  source: text("source").$type<StatSource>().notNull(),
  label: text("label").notNull(),
  opponent: text("opponent"),
  gameDate: date("game_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const battingLines = pgTable(
  "batting_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statGameId: uuid("stat_game_id")
      .notNull()
      .references(() => statGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    ab: integer("ab").notNull().default(0),
    r: integer("r").notNull().default(0),
    h: integer("h").notNull().default(0),
    doubles: integer("doubles").notNull().default(0),
    triples: integer("triples").notNull().default(0),
    hr: integer("hr").notNull().default(0),
    rbi: integer("rbi").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    k: integer("k").notNull().default(0),
    sb: integer("sb").notNull().default(0),
    hbp: integer("hbp").notNull().default(0),
    sf: integer("sf").notNull().default(0),
  },
  (t) => [uniqueIndex("batting_line_once").on(t.statGameId, t.playerId)],
);

export const pitchingLines = pgTable(
  "pitching_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statGameId: uuid("stat_game_id")
      .notNull()
      .references(() => statGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    outs: integer("outs").notNull().default(0),
    bf: integer("bf").notNull().default(0),
    pitches: integer("pitches").notNull().default(0),
    h: integer("h").notNull().default(0),
    r: integer("r").notNull().default(0),
    er: integer("er").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    k: integer("k").notNull().default(0),
  },
  (t) => [uniqueIndex("pitching_line_once").on(t.statGameId, t.playerId)],
);

// Fielding and catching season lines (GameChanger's other two exports).
// Derived rates (FPCT, CS%) compute from these raw counts.
export const fieldingLines = pgTable(
  "fielding_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statGameId: uuid("stat_game_id")
      .notNull()
      .references(() => statGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    po: integer("po").notNull().default(0),
    a: integer("a").notNull().default(0),
    e: integer("e").notNull().default(0),
    dp: integer("dp").notNull().default(0),
  },
  (t) => [uniqueIndex("fielding_line_once").on(t.statGameId, t.playerId)],
);

export const catchingLines = pgTable(
  "catching_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statGameId: uuid("stat_game_id")
      .notNull()
      .references(() => statGames.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    /** Innings caught, stored as outs (GC's "3.2" notation parses to 11). */
    outs: integer("outs").notNull().default(0),
    pb: integer("pb").notNull().default(0),
    /** Steal attempts allowed / runners caught stealing. */
    sbAllowed: integer("sb_allowed").notNull().default(0),
    cs: integer("cs").notNull().default(0),
  },
  (t) => [uniqueIndex("catching_line_once").on(t.statGameId, t.playerId)],
);

// Monthly parent reports (goal 6). Drafted by Claude (or a deterministic
// template when no API key is configured) from family-shareable data only,
// then edited/approved by a coach. Parents never see anything before
// status = "published". One report per (season, player, month).
export type ReportStatus = "draft" | "published";

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    month: text("month").notNull(), // ISO "2026-07"
    status: text("status").$type<ReportStatus>().notNull().default("draft"),
    draftText: text("draft_text").notNull(),
    // Coach-edited version; falls back to draftText until first save.
    finalText: text("final_text"),
    draftedBy: text("drafted_by").notNull(), // model id or "template"
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("report_once").on(t.seasonId, t.playerId, t.month)],
);

// Player pages (goal 12): each kid's own corner of the app, used through a
// parent's login (no child accounts). Everything here is motivational —
// avatars, personalization, effort logs. Coach ratings and evaluative
// feedback never surface on these pages.
export type AvatarKind = "builder" | "photo";
export type PageFont = "sporty" | "classic" | "fun";

export const playerPages = pgTable("player_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .unique()
    .references(() => players.id),
  avatarKind: text("avatar_kind").$type<AvatarKind>().notNull().default("builder"),
  // JSON blob of builder choices (skin/hair/hat/etc.) — parsed client-side.
  avatarConfig: text("avatar_config"),
  // Small data-URI photo when avatarKind = "photo".
  photoDataUrl: text("photo_data_url"),
  bgColor: text("bg_color"),
  borderColor: text("border_color"),
  font: text("font").$type<PageFont>().notNull().default("sporty"),
  wallpaper: text("wallpaper"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Coach-curated drill library feeding the guided workouts.
export type DrillCategory =
  | "hitting"
  | "fielding"
  | "throwing"
  | "pitching"
  | "speed"
  | "fun";

export const drills = pgTable("drills", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category").$type<DrillCategory>().notNull(),
  minutes: integer("minutes").notNull().default(10),
  // The one thought to hold while doing it — shown big during workouts.
  cue: text("cue").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Completed at-home sessions ("I have free time" workouts). Effort bars
// and streaks derive from these — effort in, progress out.
export type WorkoutSource = "guided" | "manual";

export const workoutLogs = pgTable("workout_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  day: date("day").notNull(),
  totalMinutes: integer("total_minutes").notNull(),
  // JSON array of {title, minutes, category} segments actually completed.
  segments: text("segments"),
  source: text("source").$type<WorkoutSource>().notNull().default("guided"),
  note: text("note"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Family availability for potential tournament weekends (goal 7). Distinct
// from event RSVPs: these are "could we play that day" answers used to pick
// which tournaments to enter. "unknown" is a candidate day the coach added
// that the family hasn't answered yet.
export type AvailabilityStatus = RsvpStatus | "unknown";

export const availabilityDays = pgTable(
  "availability_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    day: date("day").notNull(),
    status: text("status").$type<AvailabilityStatus>().notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("availability_once").on(t.seasonId, t.playerId, t.day)],
);
