import {
    ActionRowBuilder,
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from "discord.js";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, pollConfig, pollOptions, polls, pollVotes } from "../db/index.ts";
import type { SlashCommand } from "../types.d.ts";
import {
    buildPollEmbed,
    buildResultsEmbed,
    closePoll,
    schedulePollExpiry,
} from "../utils/pollVotes.ts";
import { SetupForm, type SetupSchema } from "../utils/setupForm.ts";

const DURATION_MULTIPLIERS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([mhdw])$/);
    if (!match?.[1] || !match[2]) return null;
    const value = Number.parseInt(match[1], 10);
    const multiplier = DURATION_MULTIPLIERS[match[2]];
    if (!multiplier) return null;
    return value * multiplier;
}

const pollSetupSchema = z.object({
    channelId: z.string().min(1, "Polls channel is required"),
});

type PollSetupData = z.infer<typeof pollSetupSchema>;

const builder = new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage polls")
    .addSubcommand((sub) =>
        sub
            .setName("setup")
            .setDescription("Configure the polls channel (admin only)"),
    )
    .addSubcommand((sub) => {
        sub.setName("create")
            .setDescription("Create a new poll")
            .addStringOption((opt) =>
                opt
                    .setName("question")
                    .setDescription("The poll question")
                    .setRequired(true),
            )
            .addStringOption((opt) =>
                opt
                    .setName("option_1")
                    .setDescription("Option 1")
                    .setRequired(true),
            )
            .addStringOption((opt) =>
                opt
                    .setName("option_2")
                    .setDescription("Option 2")
                    .setRequired(true),
            );
        for (let i = 3; i <= 10; i++) {
            sub.addStringOption((opt) =>
                opt
                    .setName(`option_${i}`)
                    .setDescription(`Option ${i}`)
                    .setRequired(false),
            );
        }
        sub.addStringOption((opt) =>
            opt
                .setName("duration")
                .setDescription(
                    "Poll duration, e.g. 30m, 1h, 5d, 2w (no expiry if omitted)",
                )
                .setRequired(false),
        );
        sub.addBooleanOption((opt) =>
            opt
                .setName("multi_select")
                .setDescription("Allow voting for multiple options")
                .setRequired(false),
        );
        sub.addBooleanOption((opt) =>
            opt
                .setName("anonymous")
                .setDescription("Hide who voted for what")
                .setRequired(false),
        );
        sub.addRoleOption((opt) =>
            opt
                .setName("role_whitelist")
                .setDescription("Only this role can vote")
                .setRequired(false),
        );
        sub.addRoleOption((opt) =>
            opt
                .setName("role_blacklist")
                .setDescription("This role cannot vote")
                .setRequired(false),
        );
        return sub;
    })
    .addSubcommand((sub) =>
        sub
            .setName("results")
            .setDescription("View results of a poll")
            .addStringOption((opt) =>
                opt
                    .setName("message_id")
                    .setDescription("The message ID of the poll")
                    .setRequired(true),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName("myvote")
            .setDescription("See your vote on a poll")
            .addStringOption((opt) =>
                opt
                    .setName("message_id")
                    .setDescription("The message ID of the poll")
                    .setRequired(true),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName("close")
            .setDescription("Close a poll (admin or poll author)")
            .addStringOption((opt) =>
                opt
                    .setName("message_id")
                    .setDescription("The message ID of the poll")
                    .setRequired(true),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName("delete")
            .setDescription("Delete a poll (admin or poll author)")
            .addStringOption((opt) =>
                opt
                    .setName("message_id")
                    .setDescription("The message ID of the poll")
                    .setRequired(true),
            ),
    );

const command: SlashCommand = {
    data: builder,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "create") {
            await handleCreate(interaction);
        } else if (subcommand === "results") {
            await handleResults(interaction);
        } else if (subcommand === "myvote") {
            await handleMyVote(interaction);
        } else if (subcommand === "close") {
            await handleClose(interaction);
        } else if (subcommand === "delete") {
            await handleDelete(interaction);
        }
    },
};

async function handleSetup(interaction: ChatInputCommandInteraction) {
    if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
        await interaction.reply({
            content: "You need administrator permissions to configure polls.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const setupSchema: SetupSchema<typeof pollSetupSchema> = {
        name: "Poll Setup",
        zodSchema: pollSetupSchema,
        fields: [
            {
                key: "channelId",
                label: "Polls Channel",
                type: "channel",
                required: true,
                zodSchema: z.string().min(1, "Polls channel ID is required"),
                description: "Select the channel where polls will be posted",
            },
        ],
        onComplete: async (data: PollSetupData) => {
            if (!interaction.guildId) {
                throw new Error("This command must be run in a server.");
            }

            await db
                .insert(pollConfig)
                .values({
                    guildId: interaction.guildId,
                    channelId: data.channelId,
                })
                .onConflictDoUpdate({
                    target: pollConfig.guildId,
                    set: { channelId: data.channelId },
                });
        },
    };

    const form = new SetupForm(setupSchema, interaction);
    await form.start();
}

async function handleCreate(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;

    const [config] = await db
        .select()
        .from(pollConfig)
        .where(eq(pollConfig.guildId, interaction.guildId))
        .limit(1);

    if (!config) {
        await interaction.reply({
            content:
                "No polls channel configured. An admin must run `/poll setup` first.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const question = interaction.options.getString("question", true);
    const multiSelect = interaction.options.getBoolean("multi_select") ?? false;
    const anonymous = interaction.options.getBoolean("anonymous") ?? false;
    const roleWhitelist = interaction.options.getRole("role_whitelist");
    const roleBlacklist = interaction.options.getRole("role_blacklist");
    const durationStr = interaction.options.getString("duration");

    if (roleWhitelist && roleBlacklist) {
        await interaction.reply({
            content: "Cannot use both role whitelist and blacklist.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    let expiresAt: Date | null = null;
    if (durationStr) {
        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
            await interaction.reply({
                content:
                    "Invalid duration format. Use a number followed by m, h, d, or w.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        expiresAt = new Date(Date.now() + durationMs);
    }

    const options: string[] = [];
    for (let i = 1; i <= 10; i++) {
        const opt = interaction.options.getString(`option_${i}`);
        if (opt) options.push(opt);
    }

    const channel = await interaction.guild?.channels.fetch(config.channelId);
    if (!channel?.isSendable()) {
        await interaction.reply({
            content: "The configured polls channel is not accessible.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const [poll] = await db
        .insert(polls)
        .values({
            guildId: interaction.guildId,
            channelId: config.channelId,
            messageId: "0",
            question,
            createdBy: interaction.user.id,
            multiSelect,
            anonymous,
            roleWhitelistId: roleWhitelist?.id ?? null,
            roleBlacklistId: roleBlacklist?.id ?? null,
            expiresAt,
        })
        .returning();

    if (!poll) return;

    const insertedOptions = await db
        .insert(pollOptions)
        .values(options.map((label) => ({ pollId: poll.id, label })))
        .returning();

    const embed = buildPollEmbed(
        question,
        insertedOptions,
        [],
        anonymous,
        interaction.user.id,
    );

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`poll:vote:${poll.id}`)
        .setPlaceholder(
            multiSelect ? "Vote for one or more options" : "Vote for an option",
        )
        .setMaxValues(multiSelect ? insertedOptions.length + 1 : 1)
        .addOptions([
            ...insertedOptions.map((opt) => ({
                label: opt.label,
                value: String(opt.id),
            })),
            { label: "Clear vote", value: "unvote" },
        ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu,
    );

    const message = await channel.send({
        embeds: [embed],
        components: [row],
    });

    await db
        .update(polls)
        .set({ messageId: message.id })
        .where(eq(polls.id, poll.id));

    if (expiresAt) {
        schedulePollExpiry(interaction.client, {
            id: poll.id,
            expiresAt,
        });
    }

    await interaction.reply({
        content: `Poll created in <#${config.channelId}>!`,
        flags: MessageFlags.Ephemeral,
    });
}

async function handleResults(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);

    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.messageId, messageId))
        .limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, poll.id));

    const votes = await db
        .select()
        .from(pollVotes)
        .where(
            inArray(
                pollVotes.pollOptionId,
                options.map((o) => o.id),
            ),
        );

    const embed = buildResultsEmbed(poll, options, votes);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleMyVote(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);

    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.messageId, messageId))
        .limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.pollId, poll.id));

    const myVotes = await db
        .select()
        .from(pollVotes)
        .where(
            and(
                inArray(
                    pollVotes.pollOptionId,
                    options.map((o) => o.id),
                ),
                eq(pollVotes.userId, interaction.user.id),
            ),
        );

    if (myVotes.length === 0) {
        await interaction.reply({
            content: "You haven't voted on this poll.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const votedOptions = options.filter((o) =>
        myVotes.some((v) => v.pollOptionId === o.id),
    );
    const labels = votedOptions.map((o) => `**${o.label}**`).join(", ");

    await interaction.reply({
        content: `Your vote: ${labels}`,
        flags: MessageFlags.Ephemeral,
    });
}

async function handleClose(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);

    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.messageId, messageId))
        .limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (poll.closed) {
        await interaction.reply({
            content: "This poll is already closed.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
    );
    const isAuthor = poll.createdBy === interaction.user.id;

    if (!isAdmin && !isAuthor) {
        await interaction.reply({
            content: "Only the poll author or an admin can close this poll.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await closePoll(interaction.client, poll.id);

    await interaction.reply({
        content: "Poll closed.",
        flags: MessageFlags.Ephemeral,
    });
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);

    const [poll] = await db
        .select()
        .from(polls)
        .where(eq(polls.messageId, messageId))
        .limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
    );
    const isAuthor = poll.createdBy === interaction.user.id;

    if (!isAdmin && !isAuthor) {
        await interaction.reply({
            content: "Only the poll author or an admin can delete this poll.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    try {
        const channel = await interaction.guild?.channels.fetch(poll.channelId);
        if (channel?.isSendable()) {
            const message = await channel.messages.fetch(messageId);
            await message.delete();
        }
    } catch {
        // Message may already be deleted
    }

    await db.delete(polls).where(eq(polls.id, poll.id));

    await interaction.reply({
        content: "Poll deleted.",
        flags: MessageFlags.Ephemeral,
    });
}

export default command;
