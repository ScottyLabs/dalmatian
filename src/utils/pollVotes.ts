import {
    type Client,
    EmbedBuilder,
    type GuildMember,
    MessageFlags,
    type StringSelectMenuInteraction,
} from "discord.js";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, pollOptions, polls, pollVotes } from "../db/index.ts";

const pollTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function buildPollEmbed(
    question: string,
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string }[],
    anonymous: boolean,
    createdBy: string,
) {
    const description = options
        .map((opt, i) => {
            let line = `**${i + 1}.** ${opt.label}`;
            if (!anonymous) {
                const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
                if (optVotes.length > 0) {
                    line += `\n${optVotes.map((v) => `<@${v.userId}>`).join(", ")}`;
                }
            }
            return line;
        })
        .join("\n");

    return new EmbedBuilder()
        .setTitle(question)
        .setDescription(description)
        .setFooter({ text: `Poll by <@${createdBy}>` })
        .setTimestamp();
}

export function buildResultsEmbed(
    poll: { question: string; anonymous: boolean },
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string }[],
) {
    const totalVotes = votes.length;

    const description = options
        .map((opt, i) => {
            const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
            const pct =
                totalVotes > 0
                    ? Math.round((optVotes.length / totalVotes) * 100)
                    : 0;
            const bar = "\u2588".repeat(Math.round(pct / 5));
            let line = `**${i + 1}.** ${opt.label} - ${optVotes.length} vote${optVotes.length === 1 ? "" : "s"} (${pct}%)\n${bar}`;
            if (!poll.anonymous && optVotes.length > 0) {
                line += `\n${optVotes.map((v) => `<@${v.userId}>`).join(", ")}`;
            }
            return line;
        })
        .join("\n\n");

    return new EmbedBuilder()
        .setTitle(`Results: ${poll.question}`)
        .setDescription(description)
        .setFooter({ text: `Total votes: ${totalVotes}` })
        .setTimestamp();
}

export async function closePoll(client: Client, pollId: number) {
    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.id, pollId))
        .limit(1);

    if (!poll || poll.closed) return;

    const options = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, poll.id));

    const optionIds = options.map((o) => o.id);
    const votes =
        optionIds.length > 0
            ? await db
                  .select()
                  .from(pollVotes)
                  .where(inArray(pollVotes.pollOptionId, optionIds))
            : [];

    await db.update(polls).set({ closed: true }).where(eq(polls.id, poll.id));

    // Cancel any existing timer
    const timer = pollTimers.get(pollId);
    if (timer) {
        clearTimeout(timer);
        pollTimers.delete(pollId);
    }

    try {
        const channel = await client.channels.fetch(poll.channelId);
        if (!channel?.isSendable()) return;

        const message = await channel.messages.fetch(poll.messageId);

        const embed = buildPollEmbed(
            `${poll.question} [CLOSED]`,
            options,
            votes,
            poll.anonymous,
            poll.createdBy,
        );
        await message.edit({ embeds: [embed], components: [] });

        const resultsEmbed = buildResultsEmbed(poll, options, votes);
        await channel.send({ embeds: [resultsEmbed] });
    } catch (error) {
        console.error(`Failed to close poll ${pollId}:`, error);
    }
}

export function schedulePollExpiry(
    client: Client,
    poll: { id: number; expiresAt: Date | null },
) {
    if (!poll.expiresAt) return;

    const remaining = poll.expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
        closePoll(client, poll.id);
        return;
    }

    const existing = pollTimers.get(poll.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        pollTimers.delete(poll.id);
        closePoll(client, poll.id);
    }, remaining);

    pollTimers.set(poll.id, timer);
}

export async function recoverPollTimers(client: Client) {
    const openPolls = await db
        .select()
        .from(polls)
        .where(and(eq(polls.closed, false), isNotNull(polls.expiresAt)));

    for (const poll of openPolls) {
        schedulePollExpiry(client, poll);
    }

    if (openPolls.length > 0) {
        console.log(`Recovered ${openPolls.length} poll timer(s)`);
    }
}

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

    if (poll.closed || (poll.expiresAt && poll.expiresAt <= new Date())) {
        await interaction.reply({
            content: "This poll is closed.",
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
