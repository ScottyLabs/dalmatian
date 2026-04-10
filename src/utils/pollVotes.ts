import {
    type GuildMember,
    MessageFlags,
    type StringSelectMenuInteraction,
} from "discord.js";
import { and, eq, inArray } from "drizzle-orm";
import { buildPollEmbed } from "../commands/poll.ts";
import { db, pollOptions, polls, pollVotes } from "../db/index.ts";

export async function handlePollVote(interaction: StringSelectMenuInteraction) {
    const pollIdStr = interaction.customId.split(":")[2];
    if (!pollIdStr || interaction.values.length === 0) return;

    const pollId = Number.parseInt(pollIdStr, 10);

    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.id, pollId))
        .limit(1);

    if (!poll) {
        await interaction.reply({
            content: "This poll no longer exists.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Check role restrictions
    const member = interaction.member as GuildMember | null;
    if (member && (poll.roleWhitelistId || poll.roleBlacklistId)) {
        const roles = member.roles;
        if (poll.roleWhitelistId && !roles.cache.has(poll.roleWhitelistId)) {
            await interaction.reply({
                content:
                    "You don't have the required role to vote on this poll.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (poll.roleBlacklistId && roles.cache.has(poll.roleBlacklistId)) {
            await interaction.reply({
                content: "Your role is not allowed to vote on this poll.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    }

    const selectedOptionIds = interaction.values.map((v) =>
        Number.parseInt(v, 10),
    );

    const allOptions = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, pollId));

    const validOptions = allOptions.filter((o) =>
        selectedOptionIds.includes(o.id),
    );

    if (validOptions.length === 0) {
        await interaction.reply({
            content: "This poll option no longer exists.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Remove all existing votes by this user on this poll
    await db.delete(pollVotes).where(
        and(
            inArray(
                pollVotes.pollOptionId,
                allOptions.map((o) => o.id),
            ),
            eq(pollVotes.userId, interaction.user.id),
        ),
    );

    // Insert new votes
    await db.insert(pollVotes).values(
        validOptions.map((opt) => ({
            pollOptionId: opt.id,
            userId: interaction.user.id,
        })),
    );

    // Update the poll embed if non-anonymous
    if (!poll.anonymous) {
        const allVotes = await db
            .select()
            .from(pollVotes)
            .where(
                inArray(
                    pollVotes.pollOptionId,
                    allOptions.map((o) => o.id),
                ),
            );

        const embed = buildPollEmbed(
            poll.question,
            allOptions,
            allVotes,
            poll.anonymous,
            poll.createdBy,
        );

        await interaction.update({ embeds: [embed] });
    } else {
        const labels = validOptions.map((o) => `**${o.label}**`).join(", ");
        await interaction.reply({
            content: `Voted for ${labels}!`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
