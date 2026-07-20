CREATE TABLE "catching_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stat_game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"outs" integer DEFAULT 0 NOT NULL,
	"pb" integer DEFAULT 0 NOT NULL,
	"sb_allowed" integer DEFAULT 0 NOT NULL,
	"cs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fielding_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stat_game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"po" integer DEFAULT 0 NOT NULL,
	"a" integer DEFAULT 0 NOT NULL,
	"e" integer DEFAULT 0 NOT NULL,
	"dp" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catching_lines" ADD CONSTRAINT "catching_lines_stat_game_id_stat_games_id_fk" FOREIGN KEY ("stat_game_id") REFERENCES "public"."stat_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catching_lines" ADD CONSTRAINT "catching_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fielding_lines" ADD CONSTRAINT "fielding_lines_stat_game_id_stat_games_id_fk" FOREIGN KEY ("stat_game_id") REFERENCES "public"."stat_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fielding_lines" ADD CONSTRAINT "fielding_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catching_line_once" ON "catching_lines" USING btree ("stat_game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fielding_line_once" ON "fielding_lines" USING btree ("stat_game_id","player_id");