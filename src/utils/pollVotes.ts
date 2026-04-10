import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { and, eq, inArray } from "drizzle-orm";
import { db, pollOptions, pollVotes } from "../db/index.ts";

export async function handlePollVote(interaction: StringSelectMenuInteraction) {
    const pollIdStr = interaction.customId.split(":")[2];
    if (!pollIdStr || interaction.values.length === 0) return;

    const pollId = Number.parseInt(pollIdStr, 10);
    const selectedOptionIds = interaction.values.map((v) =>
        Number.parseInt(v, 10),
    );

    // Verify all selected options belong to this poll
    const validOptions = await db
        .select()
        .from(pollOptions)
        .where(
            and(
                inArray(pollOptions.id, selectedOptionIds),
                eq(pollOptions.pollId, pollId),
            ),
        );

    if (validOptions.length === 0) {
        await interaction.reply({
            content: "This poll option no longer exists.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Remove all existing votes by this user on this poll
    const allOptions = await db
        .select({ id: pollOptions.id })
        .from(pollOptions)
        .where(eq(pollOptions.pollId, pollId));

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

    const labels = validOptions.map((o) => `**${o.label}**`).join(", ");
    await interaction.reply({
        content: `Voted for ${labels}!`,
        flags: MessageFlags.Ephemeral,
    });
}
