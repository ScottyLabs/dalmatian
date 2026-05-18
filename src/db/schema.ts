import {
    bigint,
    boolean,
    integer,
    pgTable,
    serial,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Reactions in any channel (except the redirect channel) trigger a redirect message
 * to the configured redirectChannelId
 */
export const redirectionInstances = pgTable("redirection_instances", {
    id: serial("id").primaryKey(),
    guildId: bigint("guild_id", { mode: "string" }).notNull(),
    redirectChannelId: bigint("redirect_channel_id", {
        mode: "string",
    }).notNull(),
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

/**
 * Guild-level configuration for the polls channel
 */
export const pollConfig = pgTable("poll_config", {
    id: serial("id").primaryKey(),
    guildId: bigint("guild_id", { mode: "string" }).notNull().unique(),
    channelId: bigint("channel_id", { mode: "string" }).notNull(),
});

/**
 * A poll created via the /poll command
 */
export const polls = pgTable("polls", {
    id: serial("id").primaryKey(),
    guildId: bigint("guild_id", { mode: "string" }).notNull(),
    channelId: bigint("channel_id", { mode: "string" }).notNull(),
    messageId: bigint("message_id", { mode: "string" }).notNull(),
    question: text("question").notNull(),
    createdBy: bigint("created_by", { mode: "string" }).notNull(),
    multiSelect: boolean("multi_select").notNull().default(false),
    anonymous: boolean("anonymous").notNull().default(false),
    roleWhitelistId: bigint("role_whitelist_id", { mode: "string" }),
    roleBlacklistId: bigint("role_blacklist_id", { mode: "string" }),
    expiresAt: timestamp("expires_at"),
    closed: boolean("closed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Options for a poll
 */
export const pollOptions = pgTable("poll_options", {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
        .notNull()
        .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
});

/**
 * Individual votes on poll options
 */
export const pollVotes = pgTable(
    "poll_votes",
    {
        id: serial("id").primaryKey(),
        pollOptionId: integer("poll_option_id")
            .notNull()
            .references(() => pollOptions.id, { onDelete: "cascade" }),
        userId: bigint("user_id", { mode: "string" }).notNull(),
        votedAt: timestamp("voted_at").defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex("poll_votes_option_user_idx").on(
            table.pollOptionId,
            table.userId,
        ),
    ],
);
