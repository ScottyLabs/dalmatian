import {
	bigint,
	integer,
	pgTable,
	serial,
	timestamp,
} from "drizzle-orm/pg-core";

/**
 * Reactions in any channel (except the redirect channel) trigger a redirect message
 * to the configured redirectChannelId
 */
export const redirectionInstances = pgTable("redirection_instances", {
	id: serial("id").primaryKey(),
	guildId: bigint("guild_id", { mode: "string" }).notNull(),
	redirectChannelId: bigint("redirect_channel_id", { mode: "string" }).notNull(),
	cooldownSeconds: integer("cooldown_seconds").notNull().default(30),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Emoji triggers define which emojis trigger the redirection
 * Can use native emoji (stored as unicode) or custom Discord emoji IDs
 */
export const emojiTriggers = pgTable("emoji_triggers", {
	id: serial("id").primaryKey(),
	redirectionInstanceId: integer("redirection_instance_id")
		.notNull()
		.references(() => redirectionInstances.id, { onDelete: "cascade" }),
	emojiId: bigint("emoji_id", { mode: "string" }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Users with any of these roles won't trigger redirects when reacted to
 */
export const immuneRoles = pgTable("immune_roles", {
	id: serial("id").primaryKey(),
	redirectionInstanceId: integer("redirection_instance_id")
		.notNull()
		.references(() => redirectionInstances.id, { onDelete: "cascade" }),
	roleId: bigint("role_id", { mode: "string" }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * User cooldowns track when users were last pinged to prevent spam
 */
export const userCooldowns = pgTable("user_cooldowns", {
	id: serial("id").primaryKey(),
	userId: bigint("user_id", { mode: "string" }).notNull(),
	redirectionInstanceId: integer("redirection_instance_id")
		.notNull()
		.references(() => redirectionInstances.id, { onDelete: "cascade" }),
	lastPingedAt: timestamp("last_pinged_at").notNull(),
});
