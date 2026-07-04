ALTER TABLE "poll_config" ADD COLUMN "show_progress_bars" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "show_progress_bars" boolean DEFAULT true NOT NULL;
