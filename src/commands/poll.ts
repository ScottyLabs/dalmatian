import {
    ActionRowBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from "discord.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, pollConfig, pollOptions, polls, pollVotes } from "../db/index.ts";
import type { SlashCommand } from "../types.d.ts";
import { SetupForm, type SetupSchema } from "../utils/setupForm.ts";

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
        sub.addBooleanOption((opt) =>
            opt
                .setName("multi_select")
                .setDescription("Allow voting for multiple options")
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

    // Insert poll and options into DB first to get IDs for select menu
    const [poll] = await db
        .insert(polls)
        .values({
            guildId: interaction.guildId,
            channelId: config.channelId,
            messageId: "0", // placeholder, updated after sending
            question,
            createdBy: interaction.user.id,
            multiSelect,
        })
        .returning();

    if (!poll) return;

    const insertedOptions = await db
        .insert(pollOptions)
        .values(options.map((label) => ({ pollId: poll.id, label })))
        .returning();

    const description = insertedOptions
        .map((opt, i) => `**${i + 1}.** ${opt.label}`)
        .join("\n");

    const embed = new EmbedBuilder()
        .setTitle(question)
        .setDescription(description)
        .setFooter({ text: `Poll by ${interaction.user.displayName}` })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`poll:vote:${poll.id}`)
        .setPlaceholder(
            multiSelect ? "Vote for one or more options" : "Vote for an option",
        )
        .setMaxValues(multiSelect ? insertedOptions.length : 1)
        .addOptions(
            insertedOptions.map((opt) => ({
                label: opt.label,
                value: String(opt.id),
            })),
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu,
    );

    const message = await channel.send({
        embeds: [embed],
        components: [row],
    });

    // Update poll with actual message ID
    await db
        .update(polls)
        .set({ messageId: message.id })
        .where(eq(polls.id, poll.id));

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

    const results = await Promise.all(
        options.map(async (opt) => {
            const votes = await db
                .select()
                .from(pollVotes)
                .where(eq(pollVotes.pollOptionId, opt.id));
            return { ...opt, voteCount: votes.length };
        }),
    );

    const totalVotes = results.reduce((sum, r) => sum + r.voteCount, 0);

    const description = results
        .map((r, i) => {
            const pct =
                totalVotes > 0
                    ? Math.round((r.voteCount / totalVotes) * 100)
                    : 0;
            const bar = "\u2588".repeat(Math.round(pct / 5));
            return `**${i + 1}.** ${r.label} - ${r.voteCount} vote${r.voteCount === 1 ? "" : "s"} (${pct}%)\n${bar}`;
        })
        .join("\n\n");

    const embed = new EmbedBuilder()
        .setTitle(`Results: ${poll.question}`)
        .setDescription(description)
        .setFooter({ text: `Total votes: ${totalVotes}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

    // Delete the poll message
    try {
        const channel = await interaction.guild?.channels.fetch(poll.channelId);
        if (channel?.isSendable()) {
            const message = await channel.messages.fetch(messageId);
            await message.delete();
        }
    } catch {
        // Message may already be deleted
    }

    // Delete from DB (cascade deletes options and votes)
    await db.delete(polls).where(eq(polls.id, poll.id));

    await interaction.reply({
        content: "Poll deleted.",
        flags: MessageFlags.Ephemeral,
    });
}

export default command;
