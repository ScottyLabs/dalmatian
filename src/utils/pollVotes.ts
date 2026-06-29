import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ButtonInteraction,
    type Client,
    EmbedBuilder,
    type GuildMember,
    MessageFlags,
    type StringSelectMenuInteraction,
} from "discord.js";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, pollOptions, pollRoles, polls, pollVotes } from "../db/index.ts";

const pollTimers = new Map<number, ReturnType<typeof setTimeout>>();

const MAX_DESCRIPTION_LENGTH = 4096;
const MEDALS = ["🥇", "🥈", "🥉"];
const BAR_WIDTH = 20;
const LIVE_BAR_WIDTH = 10;

function truncateDescription(description: string) {
    if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 4)}...\n`;
}

function buildBar(pct: number, width = BAR_WIDTH): string {
    const filled = Math.round((pct / 100) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}

function pollMessageUrl(guildId: string, channelId: string, messageId: string) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function buildPollEmbed(
    question: string,
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string; rank?: number | null }[],
    _anonymous: boolean,
    createdBy: string,
    expiresAt?: Date | null,
    rankedChoice?: boolean,
) {
    const numOptions = options.length;
    const totalVotes = votes.length;

    const lines = options.map((opt) => {
        if (rankedChoice) {
            const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
            const pts = optVotes.reduce(
                (sum, v) => sum + (v.rank != null ? numOptions - v.rank : 0),
                0,
            );
            return pts > 0 ? `**${opt.label}** — ${pts} pts` : `**${opt.label}**`;
        }
        const count = votes.filter((v) => v.pollOptionId === opt.id).length;
        if (totalVotes === 0) return `**${opt.label}**`;
        const pct = Math.round((count / totalVotes) * 100);
        return `**${opt.label}**\n${buildBar(pct, LIVE_BAR_WIDTH)} ${pct}% (${count})`;
    });

    let header = `Poll by <@${createdBy}>`;
    if (expiresAt) {
        const unixSec = Math.floor(expiresAt.getTime() / 1000);
        header += `\nCloses <t:${unixSec}:R>`;
    }
    if (rankedChoice) {
        header += "\n*Ranked choice — select options in order of preference*";
    }

    const description = truncateDescription(`${header}\n\n${lines.join("\n")}`);
    return new EmbedBuilder().setTitle(question).setDescription(description).setTimestamp();
}

export function buildVotersEmbed(
    question: string,
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string }[],
) {
    const lines = options.map((opt) => {
        const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
        if (optVotes.length === 0) return `**${opt.label}** — no votes`;
        const mentions = optVotes.map((v) => `<@${v.userId}>`).join(", ");
        return `**${opt.label}** (${optVotes.length}) — ${mentions}`;
    });

    return new EmbedBuilder()
        .setTitle(`Voters: ${question}`)
        .setDescription(truncateDescription(lines.join("\n")))
        .setTimestamp();
}

export function buildResultsEmbed(
    poll: {
        question: string;
        anonymous: boolean;
        guildId: string;
        channelId: string;
        messageId: string;
        rankedChoice: boolean;
    },
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string; rank?: number | null }[],
) {
    const pollUrl = pollMessageUrl(poll.guildId, poll.channelId, poll.messageId);

    let lines: string[];
    let footerText: string;

    if (poll.rankedChoice) {
        const numOptions = options.length;
        const totalVoters = new Set(votes.map((v) => v.userId)).size;

        const scored = options
            .map((opt) => {
                const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
                const firstChoices = optVotes.filter((v) => v.rank === 1).length;
                const bordaScore = optVotes.reduce(
                    (sum, v) => sum + (v.rank != null ? numOptions - v.rank : 0),
                    0,
                );
                return { ...opt, firstChoices, bordaScore, ranked: optVotes.length };
            })
            .sort((a, b) => b.bordaScore - a.bordaScore);

        lines = scored.map((r, i) => {
            const prefix = MEDALS[i] ?? `**${i + 1}.**`;
            return `${prefix} **${r.label}**\n**${r.bordaScore} pts** · 1st choice: ${r.firstChoices}× · ranked by ${r.ranked}`;
        });

        footerText = `${totalVoters} voter${totalVoters !== 1 ? "s" : ""} · ranked choice (Borda count)`;
    } else {
        const totalVotes = votes.length;

        const sorted = [...options].sort((a, b) => {
            const aCount = votes.filter((v) => v.pollOptionId === a.id).length;
            const bCount = votes.filter((v) => v.pollOptionId === b.id).length;
            return bCount - aCount;
        });

        lines = sorted.map((opt, i) => {
            const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
            const pct = totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;
            const prefix = MEDALS[i] ?? `**${i + 1}.**`;
            let line = `${prefix} **${opt.label}**\n${buildBar(pct)} **${pct}%** (${optVotes.length}/${totalVotes})`;
            if (!poll.anonymous && optVotes.length > 0) {
                const mentions = optVotes.map((v) => `<@${v.userId}>`).join(", ");
                line += `\n-# ${mentions}`;
            }
            return line;
        });

        footerText = `${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`;
    }

    const description = truncateDescription(
        `__**📊 Results: ${poll.question}**__ · [Jump to poll](${pollUrl})\n\n${lines.join("\n\n")}`,
    );

    return new EmbedBuilder()
        .setDescription(description)
        .setFooter({ text: footerText })
        .setTimestamp();
}

export async function closePoll(client: Client, pollId: number) {
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
    if (!poll || poll.closed) return;

    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id));
    const optionIds = options.map((o) => o.id);
    const votes =
        optionIds.length > 0
            ? await db.select().from(pollVotes).where(inArray(pollVotes.pollOptionId, optionIds))
            : [];

    await db.update(polls).set({ closed: true }).where(eq(polls.id, poll.id));

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
            null,
            poll.rankedChoice,
        );
        await message.edit({ embeds: [embed], components: [] });

        const resultsEmbed = buildResultsEmbed(poll, options, votes);
        await channel.send({ embeds: [resultsEmbed] });
    } catch (error) {
        console.error(`Failed to close poll ${pollId}:`, error);
    }
}

export function schedulePollExpiry(client: Client, poll: { id: number; expiresAt: Date | null }) {
    if (!poll.expiresAt) return;

    const remaining = poll.expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
        void closePoll(client, poll.id);
        return;
    }

    const existing = pollTimers.get(poll.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        pollTimers.delete(poll.id);
        void closePoll(client, poll.id);
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
    if (!pollIdStr) return;

    const pollId = Number.parseInt(pollIdStr, 10);
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);

    if (!poll) {
        await interaction.reply({
            content: "This poll no longer exists.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (poll.closed || (poll.expiresAt && poll.expiresAt <= new Date())) {
        await interaction.reply({ content: "This poll is closed.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Check role restrictions — junction table first, legacy columns as fallback
    const member = interaction.member as GuildMember | null;
    if (member) {
        const roleRows = await db.select().from(pollRoles).where(eq(pollRoles.pollId, poll.id));
        const whitelistIds = roleRows.filter((r) => r.type === "whitelist").map((r) => r.roleId);
        const blacklistIds = roleRows.filter((r) => r.type === "blacklist").map((r) => r.roleId);
        if (poll.roleWhitelistId) whitelistIds.push(poll.roleWhitelistId);
        if (poll.roleBlacklistId) blacklistIds.push(poll.roleBlacklistId);

        const memberRoles = member.roles.cache;
        if (whitelistIds.length > 0 && !whitelistIds.some((id) => memberRoles.has(id))) {
            await interaction.reply({
                content: "You don't have a required role to vote on this poll.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (blacklistIds.some((id) => memberRoles.has(id))) {
            await interaction.reply({
                content: "Your role is not allowed to vote on this poll.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    }

    const allOptions = await db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId));

    // Clear existing votes for this user
    await db.delete(pollVotes).where(
        and(
            inArray(
                pollVotes.pollOptionId,
                allOptions.map((o) => o.id),
            ),
            eq(pollVotes.userId, interaction.user.id),
        ),
    );

    const refreshVotes = () =>
        db
            .select()
            .from(pollVotes)
            .where(
                inArray(
                    pollVotes.pollOptionId,
                    allOptions.map((o) => o.id),
                ),
            );

    // Handle unvote
    if (interaction.values.includes("unvote")) {
        const allVotes = await refreshVotes();
        const embed = buildPollEmbed(
            poll.question,
            allOptions,
            allVotes,
            poll.anonymous,
            poll.createdBy,
            poll.expiresAt,
            poll.rankedChoice,
        );
        await interaction.update({ embeds: [embed] });
        if (poll.anonymous) {
            await interaction.followUp({ content: "Vote cleared.", flags: MessageFlags.Ephemeral });
        }
        return;
    }

    // Maintain selection order for ranked choice
    const selectedOptionIds = interaction.values
        .filter((v) => v !== "unvote")
        .map((v) => Number.parseInt(v, 10));

    const validOptions = poll.rankedChoice
        ? selectedOptionIds
              .map((id) => allOptions.find((o) => o.id === id))
              .filter((o): o is (typeof allOptions)[0] => o != null)
        : allOptions.filter((o) => selectedOptionIds.includes(o.id));

    if (validOptions.length === 0) {
        await interaction.reply({
            content: "That option no longer exists.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await db.insert(pollVotes).values(
        validOptions.map((opt, idx) => ({
            pollOptionId: opt.id,
            userId: interaction.user.id,
            rank: poll.rankedChoice ? idx + 1 : null,
        })),
    );

    const allVotes = await refreshVotes();
    const embed = buildPollEmbed(
        poll.question,
        allOptions,
        allVotes,
        poll.anonymous,
        poll.createdBy,
        poll.expiresAt,
        poll.rankedChoice,
    );
    await interaction.update({ embeds: [embed] });

    if (poll.anonymous) {
        const msg = poll.rankedChoice
            ? `Rankings recorded: ${validOptions.map((o, i) => `${i + 1}. **${o.label}**`).join(", ")}`
            : `Voted for ${validOptions.map((o) => `**${o.label}**`).join(", ")}!`;
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }
}

export async function handlePollVoters(interaction: ButtonInteraction) {
    const pollIdStr = interaction.customId.split(":")[2];
    if (!pollIdStr) return;

    const pollId = Number.parseInt(pollIdStr, 10);
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);

    if (!poll) {
        await interaction.reply({ content: "Poll not found.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (poll.anonymous) {
        await interaction.reply({
            content: "This is an anonymous poll — voter details are hidden.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId));
    const votes = await db
        .select()
        .from(pollVotes)
        .where(
            inArray(
                pollVotes.pollOptionId,
                options.map((o) => o.id),
            ),
        );

    const embed = buildVotersEmbed(poll.question, options, votes);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export function buildSeeVotersRow(pollId: number) {
    const btn = new ButtonBuilder()
        .setCustomId(`poll:voters:${pollId}`)
        .setLabel("See voters")
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}
