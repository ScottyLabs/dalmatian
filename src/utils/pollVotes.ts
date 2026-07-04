import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ButtonInteraction,
    type Client,
    ContainerBuilder,
    EmbedBuilder,
    type Guild,
    type GuildMember,
    MessageFlags,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    type StringSelectMenuInteraction,
} from "discord.js";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
    db,
    type OptionMarkerStyle,
    pollOptions,
    pollRoles,
    polls,
    pollVotes,
    type PollRoleType,
} from "../db/index.ts";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";

const pollTimers = new Map<number, ReturnType<typeof setTimeout>>();

const MAX_DESCRIPTION_LENGTH = 4096;
// Components v2 messages cap at 4000 chars total, so leave room for the rest of the message.
const MAX_COMPONENT_BODY_LENGTH = 3500;
const MEDALS = ["**1.**", "**2.**", "**3.**"];
const BAR_WIDTH = 20;
const DIVIDER = "─".repeat(24);

/** Regional-indicator letter emoji (🇦-🇹), enough to cover MAX_OPTIONS (20) with a stable identity per option */
const LETTER_MARKERS = Array.from({ length: 20 }, (_, i) => String.fromCodePoint(0x1f_1e6 + i));
/** Keycap digit emoji 0️⃣-9️⃣, used to build number markers. */
const DIGIT_KEYCAPS = Array.from({ length: 10 }, (_, d) => `${d}️⃣`);
const TEN_KEYCAP = "🔟";

/** Keycap emoji for 1-10, or concatenated digit keycaps beyond that (no single glyph exists). */
function numberMarker(n: number): string {
    if (n === 10) return TEN_KEYCAP;
    if (n >= 1 && n <= 9) return DIGIT_KEYCAPS[n] ?? `${n}.`;
    return String(n)
        .split("")
        .map((d) => DIGIT_KEYCAPS[Number(d)] ?? d)
        .join("");
}

/** Text form of an option's marker, based on its original (creation) order - stable across re-sorts. */
export function optionMarkerText(index: number, style: OptionMarkerStyle): string {
    if (style === "number") return numberMarker(index + 1);
    return LETTER_MARKERS[index] ?? `${index + 1}.`;
}

/** Single-emoji form for setEmoji(), or null if the marker needs multiple glyphs (numbers past 10). */
export function optionMarkerEmoji(
    index: number,
    style: OptionMarkerStyle,
): { name: string } | null {
    const n = index + 1;
    if (style === "number") return n <= 10 ? { name: numberMarker(n) } : null;
    return { name: LETTER_MARKERS[index] ?? `${index + 1}.` };
}

export function buildOptionMarkerMap(
    options: { id: number }[],
    style: OptionMarkerStyle,
): Map<number, string> {
    const map = new Map<number, string>();
    options.forEach((opt, i) => map.set(opt.id, optionMarkerText(i, style)));
    return map;
}

function truncateDescription(description: string) {
    if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 4)}...\n`;
}

function truncateBody(body: string) {
    if (body.length <= MAX_COMPONENT_BODY_LENGTH) return body;
    const cut = body.slice(0, MAX_COMPONENT_BODY_LENGTH - 4);
    // Re-close the code fence if the cut landed inside one.
    const openFences = (cut.match(/```/g) ?? []).length % 2;
    return `${cut}...${openFences ? "\n```" : ""}`;
}

function buildBar(pct: number, width = BAR_WIDTH): string {
    return "`" + buildBarRaw(pct, width) + "`";
}

function buildBarRaw(pct: number, width = BAR_WIDTH): string {
    const filled = Math.round((pct / 100) * width);
    return "█".repeat(filled) + "▒".repeat(width - filled);
}

// Labels past this width stop getting padded, so one long option can't blow out the table.
const TABLE_LABEL_CAP = 36;

/** Renders each option's vote share as a monospaced table; labels over TABLE_LABEL_CAP get their bar/percentage on an indented line underneath instead of trailing inline. */
function buildOptionsTable(
    options: { id: number; label: string }[],
    votes: { pollOptionId: number }[],
    markerMap: Map<number, string>,
    showProgressBars: boolean,
): string {
    const totalVotes = votes.length;
    const width = Math.min(TABLE_LABEL_CAP, Math.max(1, ...options.map((o) => o.label.length)));

    const lines = options.map((opt) => {
        const marker = markerMap.get(opt.id) ?? "";
        const count = votes.filter((v) => v.pollOptionId === opt.id).length;

        let stats: string | null = null;
        if (totalVotes > 0) {
            const pct = Math.round((count / totalVotes) * 100);
            const pctStr = `${pct}%`.padStart(4);
            const bar = showProgressBars ? `${buildBarRaw(pct)}  ` : "";
            stats = `${bar}${pctStr} (${count})`;
        }

        if (opt.label.length > TABLE_LABEL_CAP) {
            return stats ? `${marker} ${opt.label}\n   ${stats}` : `${marker} ${opt.label}`;
        }

        const label = opt.label.padEnd(width);
        return stats ? `${marker} ${label}  ${stats}` : `${marker} ${label}`.trimEnd();
    });

    return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

/** Bolded whitelist/blacklist text for the message body (no "-# " prefix - callers add that themselves). */
function formatRoleRestrictionText(
    whitelistNames: string[],
    blacklistNames: string[],
): string | null {
    const parts: string[] = [];
    if (whitelistNames.length > 0) parts.push(`**Whitelisted:** ${whitelistNames.join(", ")}`);
    if (blacklistNames.length > 0) parts.push(`**Blacklisted:** ${blacklistNames.join(", ")}`);
    return parts.length > 0 ? parts.join("  •  ") : null;
}

/** Resolves whitelist/blacklist role IDs (junction table + deprecated single-role columns) to names. */
export function resolveRoleNames(
    guild: Guild | undefined,
    roleRows: { roleId: string; type: PollRoleType }[],
    poll: { roleWhitelistId: string | null; roleBlacklistId: string | null },
): { whitelist: string[]; blacklist: string[] } {
    const whitelistIds = roleRows.filter((r) => r.type === "whitelist").map((r) => r.roleId);
    const blacklistIds = roleRows.filter((r) => r.type === "blacklist").map((r) => r.roleId);
    if (poll.roleWhitelistId) whitelistIds.push(poll.roleWhitelistId);
    if (poll.roleBlacklistId) blacklistIds.push(poll.roleBlacklistId);

    const nameOf = (id: string) => guild?.roles.cache.get(id)?.name ?? "unknown role";
    return {
        whitelist: whitelistIds.map(nameOf),
        blacklist: blacklistIds.map(nameOf),
    };
}

function pollMessageUrl(guildId: string, channelId: string, messageId: string) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** Builds the live/closed poll message as a Components v2 container, so it can have a real divider under the title. */
export function buildPollContainer(
    question: string,
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string; rank?: number | null }[],
    createdBy: string,
    expiresAt?: Date | null,
    rankedChoice?: boolean,
    showProgressBars = true,
    markerStyle: OptionMarkerStyle = "letter",
    roleNames?: { whitelist: string[]; blacklist: string[] },
): ContainerBuilder {
    const numOptions = options.length;
    const markerMap = buildOptionMarkerMap(options, markerStyle);

    let body: string;
    if (rankedChoice) {
        body = options
            .map((opt) => {
                const marker = markerMap.get(opt.id) ?? "";
                const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
                const pts = optVotes.reduce(
                    (sum, v) => sum + (v.rank != null ? numOptions - v.rank : 0),
                    0,
                );
                return pts > 0
                    ? `${marker} **${opt.label}** - ${pts} pts`
                    : `${marker} **${opt.label}**`;
            })
            .join("\n");
    } else {
        body = buildOptionsTable(options, votes, markerMap, showProgressBars);
    }

    let header = `Poll by <@${createdBy}>`;
    if (expiresAt) {
        const unixSec = Math.floor(expiresAt.getTime() / 1000);
        header += `\nCloses <t:${unixSec}:R>`;
    }
    if (rankedChoice) {
        header += "\n*Ranked choice - select options in order of preference*";
    }

    const sections = [header, truncateBody(body)];

    // Role restriction and timestamp share one small-text line instead of two.
    const roleText = formatRoleRestrictionText(
        roleNames?.whitelist ?? [],
        roleNames?.blacklist ?? [],
    );
    const nowUnix = Math.floor(Date.now() / 1000);
    const timestamp = `<t:${nowUnix}:f>`;
    sections.push(roleText ? `-# ${roleText} - ${timestamp}` : `-# ${timestamp}`);

    return new ContainerBuilder()
        .setAccentColor(DEFAULT_EMBED_COLOR)
        .addTextDisplayComponents((t) => t.setContent(`# ${question}`))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents((t) => t.setContent(sections.join("\n\n")));
}

/** Vote select menu + optional "See voters" button, shared between poll creation and every vote update. */
export function buildVoteRows(
    poll: { id: number; rankedChoice: boolean; multiSelect: boolean; anonymous: boolean },
    options: { id: number; label: string }[],
    markerStyle: OptionMarkerStyle,
): ActionRowBuilder<any>[] {
    const isMultiChoice = poll.multiSelect || poll.rankedChoice;
    const placeholder = poll.rankedChoice
        ? "Rank by preference"
        : poll.multiSelect
          ? "Vote for one or more options"
          : "Vote for an option";

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`poll:vote:${poll.id}`)
        .setPlaceholder(placeholder)
        .setMaxValues(isMultiChoice ? options.length : 1)
        .addOptions([
            ...options.map((opt, i) => {
                const marker = optionMarkerText(i, markerStyle);
                const emoji = optionMarkerEmoji(i, markerStyle);
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(emoji ? opt.label : `${marker} ${opt.label}`.slice(0, 100))
                    .setValue(String(opt.id));
                return emoji ? option.setEmoji(emoji) : option;
            }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Clear vote")
                .setValue("unvote")
                .setEmoji({ name: "🗑️" }),
        ]);

    const rows: ActionRowBuilder<any>[] = [new ActionRowBuilder().addComponents(selectMenu)];
    if (!poll.anonymous) rows.push(buildSeeVotersRow(poll.id));
    return rows;
}

export function buildVotersEmbed(
    question: string,
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string }[],
    markerStyle: OptionMarkerStyle = "letter",
) {
    const markerMap = buildOptionMarkerMap(options, markerStyle);
    const lines = options.map((opt) => {
        const marker = markerMap.get(opt.id) ?? "";
        const optVotes = votes.filter((v) => v.pollOptionId === opt.id);
        if (optVotes.length === 0) return `${marker} **${opt.label}** - no votes`;
        const mentions = optVotes.map((v) => `<@${v.userId}>`).join(", ");
        return `${marker} **${opt.label}** (${optVotes.length}) - ${mentions}`;
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
        showProgressBars?: boolean;
        optionMarkerStyle?: OptionMarkerStyle;
    },
    options: { id: number; label: string }[],
    votes: { pollOptionId: number; userId: string; rank?: number | null }[],
    roleNames?: { whitelist: string[]; blacklist: string[] },
) {
    const pollUrl = pollMessageUrl(poll.guildId, poll.channelId, poll.messageId);
    const markerMap = buildOptionMarkerMap(options, poll.optionMarkerStyle ?? "letter");
    const showProgressBars = poll.showProgressBars ?? true;

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
            const marker = markerMap.get(r.id) ?? "";
            return `${prefix} ${marker} **${r.label}**\n**${r.bordaScore} pts**  •  1st choice: ${r.firstChoices}x  •  ranked by ${r.ranked}`;
        });

        footerText = `${totalVoters} voter${totalVoters !== 1 ? "s" : ""}  •  ranked choice (Borda count)`;
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
            const marker = markerMap.get(opt.id) ?? "";
            const barPart = showProgressBars ? `${buildBar(pct)} ` : "";
            let line = `${prefix} ${marker} **${opt.label}**\n${barPart}**${pct}%** (${optVotes.length}/${totalVotes})`;
            if (!poll.anonymous && optVotes.length > 0) {
                const mentions = optVotes.map((v) => `<@${v.userId}>`).join(", ");
                line += `\n-# ${mentions}`;
            }
            return line;
        });

        footerText = `${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`;
    }

    const roleText = formatRoleRestrictionText(
        roleNames?.whitelist ?? [],
        roleNames?.blacklist ?? [],
    );

    const description = truncateDescription(
        `__**Results: ${poll.question}**__  •  [Jump to poll](${pollUrl})\n${DIVIDER}\n${lines.join("\n\n")}${roleText ? `\n\n-# ${roleText}` : ""}`,
    );

    return new EmbedBuilder()
        .setDescription(description)
        .setFooter({ text: footerText })
        .setTimestamp();
}

export async function closePoll(client: Client, pollId: number) {
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
    if (!poll || poll.closed) return;

    const options = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, poll.id))
        .orderBy(asc(pollOptions.id));
    const optionIds = options.map((o) => o.id);
    const votes =
        optionIds.length > 0
            ? await db.select().from(pollVotes).where(inArray(pollVotes.pollOptionId, optionIds))
            : [];
    const roleRows = await db.select().from(pollRoles).where(eq(pollRoles.pollId, poll.id));

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
        const guild = client.guilds.cache.get(poll.guildId);
        const roleNames = resolveRoleNames(guild, roleRows, poll);

        const container = buildPollContainer(
            `${poll.question} [CLOSED]`,
            options,
            votes,
            poll.createdBy,
            null,
            poll.rankedChoice,
            poll.showProgressBars,
            poll.optionMarkerStyle,
            roleNames,
        );
        await message.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });

        const resultsEmbed = buildResultsEmbed(poll, options, votes, roleNames);
        await channel.send({ embeds: [resultsEmbed], allowedMentions: { parse: [] } });
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

    // Check role restrictions - junction table first, legacy columns as fallback
    const roleRows = await db.select().from(pollRoles).where(eq(pollRoles.pollId, poll.id));
    const roleNames = resolveRoleNames(interaction.guild ?? undefined, roleRows, poll);

    const member = interaction.member as GuildMember | null;
    if (member) {
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

    const allOptions = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, pollId))
        .orderBy(asc(pollOptions.id));

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
        const container = buildPollContainer(
            poll.question,
            allOptions,
            allVotes,
            poll.createdBy,
            poll.expiresAt,
            poll.rankedChoice,
            poll.showProgressBars,
            poll.optionMarkerStyle,
            roleNames,
        );
        const rows = buildVoteRows(poll, allOptions, poll.optionMarkerStyle);
        await interaction.update({
            components: [container, ...rows],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
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
    const container = buildPollContainer(
        poll.question,
        allOptions,
        allVotes,
        poll.createdBy,
        poll.expiresAt,
        poll.rankedChoice,
        poll.showProgressBars,
        poll.optionMarkerStyle,
        roleNames,
    );
    const rows = buildVoteRows(poll, allOptions, poll.optionMarkerStyle);
    await interaction.update({
        components: [container, ...rows],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });

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
            content: "This is an anonymous poll - voter details are hidden.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, pollId))
        .orderBy(asc(pollOptions.id));
    const votes = await db
        .select()
        .from(pollVotes)
        .where(
            inArray(
                pollVotes.pollOptionId,
                options.map((o) => o.id),
            ),
        );

    const embed = buildVotersEmbed(poll.question, options, votes, poll.optionMarkerStyle);
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    });
}

export function buildSeeVotersRow(pollId: number) {
    const btn = new ButtonBuilder()
        .setCustomId(`poll:voters:${pollId}`)
        .setLabel("See voters")
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}
