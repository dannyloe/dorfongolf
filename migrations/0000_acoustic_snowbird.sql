CREATE TABLE "course_holes" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"hole_number" integer NOT NULL,
	"par" integer NOT NULL,
	"handicap" integer
);
--> statement-breakpoint
CREATE TABLE "course_tees" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"name" text NOT NULL,
	"slope_rating" integer NOT NULL,
	"course_rating" integer NOT NULL,
	"yardage" integer,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slope_rating" integer,
	"course_rating" integer,
	CONSTRAINT "courses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "event_match_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"amount" integer NOT NULL,
	"bet_type" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"is_auto_press" boolean DEFAULT false NOT NULL,
	"team_name" text,
	"team_index" integer,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"match_type" text DEFAULT 'match_play' NOT NULL,
	"unit_amount" integer DEFAULT 0 NOT NULL,
	"parent_match_id" integer,
	"start_hole" integer DEFAULT 1 NOT NULL,
	"auto_press_original" boolean DEFAULT true NOT NULL,
	"auto_press_all_presses" boolean DEFAULT false NOT NULL,
	"auto_press_nassau_front9" boolean DEFAULT true NOT NULL,
	"auto_press_nassau_back9" boolean DEFAULT true NOT NULL,
	"auto_press_nassau_overall" boolean DEFAULT true NOT NULL,
	"use_net_scoring" boolean DEFAULT false NOT NULL,
	"has_been_replicated" boolean DEFAULT false NOT NULL,
	"start_on_back_9" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "manual_bet_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"bet_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"preset_player_id" integer,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"creator_id" integer,
	"ryder_cup_event_id" integer
);
--> statement-breakpoint
CREATE TABLE "match_player_handicaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"course_handicap" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"course_name" text NOT NULL,
	"course_id" integer,
	"group_id" integer,
	"ryder_cup_event_id" integer,
	"ryder_cup_day_number" integer,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed" boolean DEFAULT false,
	"is_handicapped" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer,
	"sender_id" text NOT NULL,
	"recipient_id" text,
	"content" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_invitations" boolean DEFAULT true,
	"score_updates" boolean DEFAULT false,
	"bet_results" boolean DEFAULT true,
	"match_reminders" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "player_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"canonical_name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_course_defaults" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_player_name" text NOT NULL,
	"course_id" integer NOT NULL,
	"tee_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_handicaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_player_name" text NOT NULL,
	"handicap_index" integer,
	"default_tee_id" integer,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_handicaps_preset_player_name_unique" UNIQUE("preset_player_name")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"preset_player_id" integer,
	"handicap_index" integer,
	"tee_id" integer
);
--> statement-breakpoint
CREATE TABLE "preset_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"show_in_roster" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "preset_players_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_closest_to_hole" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"hole_number" integer NOT NULL,
	"winner_name" text,
	"winner_preset_player_id" integer
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"day_number" integer NOT NULL,
	"date" timestamp,
	"tee_times" text[],
	"course_id" integer,
	"course_name" text,
	"skins_carryover" integer DEFAULT 0 NOT NULL,
	"skins_distributed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_on_back_9" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"course_id" integer,
	"course_name" text NOT NULL,
	"creator_id" text NOT NULL,
	"buy_in_amount" integer DEFAULT 30000 NOT NULL,
	"team_win_bonus" integer DEFAULT 12500 NOT NULL,
	"match_win_bonus" integer DEFAULT 2500 NOT NULL,
	"match_tie_bonus" integer DEFAULT 1250 NOT NULL,
	"daily_skins_pot" integer DEFAULT 21250 NOT NULL,
	"closest_to_hole_payout" integer DEFAULT 0 NOT NULL,
	"include_buy_in_in_ledger" boolean DEFAULT true NOT NULL,
	"target_points" integer DEFAULT 65 NOT NULL,
	"use_handicaps" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'setup' NOT NULL,
	"winning_team_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_pairing_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"pairing_id" integer NOT NULL,
	"winning_side_id" integer,
	"winning_margin" text,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_pairing_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"side_id" integer NOT NULL,
	"hole_number" integer NOT NULL,
	"player1_strokes" integer,
	"player2_strokes" integer
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_pairing_sides" (
	"id" serial PRIMARY KEY NOT NULL,
	"pairing_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"player1_name" text NOT NULL,
	"player2_name" text,
	"player1_id" integer,
	"player2_id" integer,
	"player1_handicap_index" integer,
	"player1_tee_id" integer,
	"player2_handicap_index" integer,
	"player2_tee_id" integer
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_pairings" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"match_number" integer NOT NULL,
	"tee_time" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"match_format" text DEFAULT 'match_play_1_ball' NOT NULL,
	"use_net_scoring" boolean DEFAULT false NOT NULL,
	"point_value" integer DEFAULT 10 NOT NULL,
	"purse_amount" integer,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_skins" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"hole_number" integer NOT NULL,
	"winner_name" text,
	"winner_preset_player_id" integer,
	"skin_value" integer DEFAULT 1 NOT NULL,
	"use_net_scoring" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"preset_player_id" integer,
	"handicap_index" integer,
	"course_handicap" integer
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"total_points" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_transaction_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"preset_player_id" integer,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ryder_cup_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"payer_name" text NOT NULL,
	"payer_preset_player_id" integer,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"hole_number" integer NOT NULL,
	"strokes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"from_player_name" text NOT NULL,
	"from_preset_player_id" integer,
	"to_player_name" text NOT NULL,
	"to_preset_player_id" integer,
	"amount" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"creator_id" text
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_match_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"phone" varchar,
	"phone_verified" boolean DEFAULT false,
	"profile_image_url" varchar,
	"preset_player_name" varchar,
	"is_admin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");