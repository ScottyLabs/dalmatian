import {
    Events,
    type MessageReaction,
    type PartialMessageReaction,
    type PartialUser,
    type User,
} from "discord.js";
import type { Event } from "../types.d.ts";
import {
    checkReactionRedirect,
    recordUserPing,
} from "../utils/reactionRedirect.ts";

const event: Event<Events.MessageReactionAdd> = {
    name: Events.MessageReactionAdd,
    once: false,
    async execute(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
    ) {
        try {
            // Ignore bot reactions
            if (user.bot) return;

            // Check if this reaction should trigger a redirect
            if (reaction.partial) {
                reaction = await reaction.fetch();
            }

            const result = await checkReactionRedirect(reaction);

            if (!result.shouldRedirect || !result.redirectionInstance) {
                return;
            }

            // Get the message (fetched in checkReactionRedirect)
            const message = reaction.message;

            if (!message.author || !message.guild) {
                console.error(
                    "Cannot send redirect message: invalid message data",
                );
                return;
            }

            // Fetch the redirect channel
            const redirectChannel = await message.guild.channels.fetch(
                result.redirectionInstance.redirectChannelId,
            );

            if (!redirectChannel?.isSendable()) {
                console.error(
                    "Cannot send redirect message: redirect channel not sendable",
                );
                return;
            }

            // Send the redirect message to the redirect channel
            const redirectMessage = `<@${message.author.id}>, please continue ${message.url} here`;

            await redirectChannel.send(redirectMessage);

            // Record the ping for cooldown tracking
            await recordUserPing(
                message.author.id,
                result.redirectionInstance.id,
            );

            console.log(
                `Redirected ${user.tag} reaction to ${message.author.tag}'s message`,
            );
        } catch (error) {
            console.error("Error handling message reaction:", error);
        }
    },
};

export default event;
