CREATE TABLE "emoji_triggers" (
	"id" serial PRIMARY KEY,
	"redirection_instance_id" integer NOT NULL,
	"emoji_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "immune_roles" (
	"id" serial PRIMARY KEY,
	"redirection_instance_id" integer NOT NULL,
	"role_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirection_instances" (
	"id" serial PRIMARY KEY,
	"guild_id" bigint NOT NULL,
	"redirect_channel_id" bigint NOT NULL,
	"cooldown_seconds" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cooldowns" (
	"id" serial PRIMARY KEY,
	"user_id" bigint NOT NULL,
	"redirection_instance_id" integer NOT NULL,
	"last_pinged_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emoji_triggers" ADD CONSTRAINT "emoji_triggers_gJ33WKmVTh0x_fkey" FOREIGN KEY ("redirection_instance_id") REFERENCES "redirection_instances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "immune_roles" ADD CONSTRAINT "immune_roles_oEZBevnYvtQW_fkey" FOREIGN KEY ("redirection_instance_id") REFERENCES "redirection_instances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_cooldowns" ADD CONSTRAINT "user_cooldowns_Icd8snWxKqAN_fkey" FOREIGN KEY ("redirection_instance_id") REFERENCES "redirection_instances"("id") ON DELETE CASCADE;