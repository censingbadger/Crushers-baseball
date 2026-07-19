CREATE TABLE "batting_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"spot" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"inning" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"position" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"opponent" text,
	"status" text DEFAULT 'setup' NOT NULL,
	"innings" integer DEFAULT 6 NOT NULL,
	"clock_minutes" integer DEFAULT 90 NOT NULL,
	"started_at" timestamp,
	"current_inning" integer DEFAULT 1 NOT NULL,
	"outs" integer DEFAULT 0 NOT NULL,
	"game_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"inning" integer NOT NULL,
	"pitches" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"inning" integer NOT NULL,
	"side" text NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batting_orders" ADD CONSTRAINT "batting_orders_game_id_live_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."live_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batting_orders" ADD CONSTRAINT "batting_orders_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_game_id_live_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."live_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_games" ADD CONSTRAINT "live_games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_games" ADD CONSTRAINT "live_games_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_counts" ADD CONSTRAINT "pitch_counts_game_id_live_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."live_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_counts" ADD CONSTRAINT "pitch_counts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_lines" ADD CONSTRAINT "score_lines_game_id_live_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."live_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batting_spot_once" ON "batting_orders" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_once" ON "game_assignments" USING btree ("game_id","inning","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pitch_once" ON "pitch_counts" USING btree ("game_id","player_id","inning");--> statement-breakpoint
CREATE UNIQUE INDEX "score_once" ON "score_lines" USING btree ("game_id","inning","side");