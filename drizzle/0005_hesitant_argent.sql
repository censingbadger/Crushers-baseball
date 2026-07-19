CREATE TABLE "batting_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stat_game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"ab" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"doubles" integer DEFAULT 0 NOT NULL,
	"triples" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	"rbi" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"k" integer DEFAULT 0 NOT NULL,
	"sb" integer DEFAULT 0 NOT NULL,
	"hbp" integer DEFAULT 0 NOT NULL,
	"sf" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitching_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stat_game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"outs" integer DEFAULT 0 NOT NULL,
	"bf" integer DEFAULT 0 NOT NULL,
	"pitches" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"er" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"k" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stat_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"opponent" text,
	"game_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batting_lines" ADD CONSTRAINT "batting_lines_stat_game_id_stat_games_id_fk" FOREIGN KEY ("stat_game_id") REFERENCES "public"."stat_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batting_lines" ADD CONSTRAINT "batting_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitching_lines" ADD CONSTRAINT "pitching_lines_stat_game_id_stat_games_id_fk" FOREIGN KEY ("stat_game_id") REFERENCES "public"."stat_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitching_lines" ADD CONSTRAINT "pitching_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_games" ADD CONSTRAINT "stat_games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batting_line_once" ON "batting_lines" USING btree ("stat_game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pitching_line_once" ON "pitching_lines" USING btree ("stat_game_id","player_id");