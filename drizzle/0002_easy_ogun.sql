CREATE TABLE "weekend_plan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"pos_a" text,
	"innings_a" integer DEFAULT 0 NOT NULL,
	"pos_b" text,
	"innings_b" integer DEFAULT 0 NOT NULL,
	"pitch_innings" integer DEFAULT 0 NOT NULL,
	"pitch_max_per_game" integer,
	"pitch_games" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekend_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"games" integer DEFAULT 4 NOT NULL,
	"innings_per_game" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekend_plans_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "weekend_plan_lines" ADD CONSTRAINT "weekend_plan_lines_plan_id_weekend_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekend_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekend_plan_lines" ADD CONSTRAINT "weekend_plan_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekend_plans" ADD CONSTRAINT "weekend_plans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_player_once" ON "weekend_plan_lines" USING btree ("plan_id","player_id");