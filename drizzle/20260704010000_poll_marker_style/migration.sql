ALTER TABLE "poll_config" ADD COLUMN "option_marker_style" text DEFAULT 'letter' NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "option_marker_style" text DEFAULT 'letter' NOT NULL;
