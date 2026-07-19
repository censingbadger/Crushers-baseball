import {
  boolean,
  date,
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

// Family availability for potential tournament weekends (goal 7). Distinct
// from event RSVPs: these are "could we play that day" answers used to pick
// which tournaments to enter.
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
    status: text("status").$type<RsvpStatus>().notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("availability_once").on(t.seasonId, t.playerId, t.day)],
);
