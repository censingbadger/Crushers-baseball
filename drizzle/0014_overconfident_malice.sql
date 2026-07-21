CREATE TABLE "game_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"section" text NOT NULL,
	"summary" text NOT NULL,
	"actor" text NOT NULL,
	"created_by_user_id" uuid,
	"coalesce_key" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_assignments" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_edits" ADD CONSTRAINT "game_edits_game_id_live_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."live_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_edits" ADD CONSTRAINT "game_edits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_edits_game" ON "game_edits" USING btree ("game_id");