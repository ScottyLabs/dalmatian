ALTER TABLE "polls" ADD COLUMN "ranked_choice" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD COLUMN "rank" integer;
--> statement-breakpoint
CREATE TABLE "poll_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"role_id" bigint NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poll_roles" ADD CONSTRAINT "poll_roles_poll_id_polls_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE;
