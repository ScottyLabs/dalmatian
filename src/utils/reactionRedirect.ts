import type { MessageReaction } from "discord.js";
import { and, eq, gt } from "drizzle-orm";
import {
    db,
    emojiTriggers,
    immuneRoles,
    redirectionInstances,
    userCooldowns,
} from "../db/index.ts";

interface RedirectCheckResult {
    shouldRedirect: boolean;
    reason?: string;
    redirectionInstance?: typeof redirectionInstances.$inferSelect;
}

/**
 * Checks if a reaction should trigger a redirect message
 * Returns redirect configuration if all conditions are met
 */
export async function checkReactionRedirect(
    reaction: MessageReaction,
): Promise<RedirectCheckResult> {
    // Get the message and ensure it's fully fetched
    const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;

    if (!message.channel.id || !message.author || !message.guildId) {
        return { shouldRedirect: false, reason: "Invalid message data" };
    }

    // Find redirection instance for this guild
    const [instance] = await db
        .select()
        .from(redirectionInstances)
        .where(eq(redirectionInstances.guildId, message.guildId))
        .limit(1);

    if (!instance) {
        return {
            shouldRedirect: false,
            reason: "No redirection configured for this server",
        };
    }

    // Skip if reaction is in the redirect channel itself
    if (message.channel.id === instance.redirectChannelId) {
        return {
            shouldRedirect: false,
            reason: "Reaction is in the redirect channel (immune)",
        };
    }

    // Get emoji triggers for this instance
    const triggers = await db
        .select()
        .from(emojiTriggers)
        .where(eq(emojiTriggers.redirectionInstanceId, instance.id));

    // Check if the emoji matches a trigger
    const emojiId = reaction.emoji.id ?? reaction.emoji.name ?? "";
    const isMatchingEmoji = triggers.some(
        (trigger) => trigger.emojiId === emojiId,
    );

    if (!isMatchingEmoji) {
        return {
            shouldRedirect: false,
            reason: "Emoji not configured as trigger",
        };
    }

    // Get immune roles for this instance
    const immune = await db
        .select()
        .from(immuneRoles)
        .where(eq(immuneRoles.redirectionInstanceId, instance.id));

    // Check if message author has immune role
    if (message.member) {
        const hasImmuneRole = message.member.roles.cache.some((role) =>
            immune.some((ir) => ir.roleId === role.id),
        );

        if (hasImmuneRole) {
            return {
                shouldRedirect: false,
                reason: "Message author has immune role",
            };
        }
    }

    // Check cooldown
    const cooldownThreshold = new Date(
        Date.now() - instance.cooldownSeconds * 1000,
    );

    const [recentPing] = await db
        .select()
        .from(userCooldowns)
        .where(
            and(
                eq(userCooldowns.userId, message.author.id),
                eq(userCooldowns.redirectionInstanceId, instance.id),
                gt(userCooldowns.lastPingedAt, cooldownThreshold),
            ),
        )
        .limit(1);

    if (recentPing) {
        return {
            shouldRedirect: false,
            reason: "Author was pinged recently (cooldown)",
        };
    }

    return { shouldRedirect: true, redirectionInstance: instance };
}

/**
 * Records that a user was pinged, updating cooldown tracking
 */
export async function recordUserPing(
    userId: string,
    redirectionInstanceId: number,
): Promise<void> {
    // Check if record exists
    const [existing] = await db
        .select()
        .from(userCooldowns)
        .where(
            and(
                eq(userCooldowns.userId, userId),
                eq(userCooldowns.redirectionInstanceId, redirectionInstanceId),
            ),
        )
        .limit(1);

    if (existing) {
        // Update existing record
        await db
            .update(userCooldowns)
            .set({ lastPingedAt: new Date() })
            .where(eq(userCooldowns.id, existing.id));
    } else {
        // Insert new record
        await db.insert(userCooldowns).values({
            userId,
            redirectionInstanceId,
            lastPingedAt: new Date(),
        });
    }
}
