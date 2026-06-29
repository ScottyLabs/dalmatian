import {
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, pollConfig, pollOptions, polls, pollVotes } from "../db/index.ts";
import type { SlashCommand } from "../types.d.ts";
import { buildResultsEmbed, closePoll } from "../utils/pollVotes.ts";
import { PollCreateForm } from "../utils/pollCreateForm.ts";
import { SetupForm, type SetupSchema } from "../utils/setupForm.ts";

const pollSetupSchema = z.object({
    channelId: z.string().min(1, "Polls channel is required"),
});

type PollSetupData = z.infer<typeof pollSetupSchema>;

const builder = new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage polls")
    .addSubcommand((sub) =>
        sub.setName("setup").setDescription("Configure the polls channel (admin only)"),
    )
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a new poll"))
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
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
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
            if (!interaction.guildId) throw new Error("This command must be run in a server.");
            await db
                .insert(pollConfig)
                .values({ guildId: interaction.guildId, channelId: data.channelId })
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
            content: "No polls channel configured. An admin must run `/poll setup` first.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const form = new PollCreateForm(interaction, config.channelId);
    await form.start();
}

async function handleResults(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);
    const [poll] = await db.select().from(polls).where(eq(polls.messageId, messageId)).limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id));
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
    const [poll] = await db.select().from(polls).where(eq(polls.messageId, messageId)).limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id));

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

    const votedOptions = options
        .filter((o) => myVotes.some((v) => v.pollOptionId === o.id))
        .sort((a, b) => {
            const rankA = myVotes.find((v) => v.pollOptionId === a.id)?.rank ?? 999;
            const rankB = myVotes.find((v) => v.pollOptionId === b.id)?.rank ?? 999;
            return rankA - rankB;
        });

    const labels = poll.rankedChoice
        ? votedOptions.map((o, i) => `${i + 1}. **${o.label}**`).join(", ")
        : votedOptions.map((o) => `**${o.label}**`).join(", ");

    await interaction.reply({ content: `Your vote: ${labels}`, flags: MessageFlags.Ephemeral });
}

async function handleClose(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);
    const [poll] = await db.select().from(polls).where(eq(polls.messageId, messageId)).limit(1);

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

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    const isAuthor = poll.createdBy === interaction.user.id;

    if (!isAdmin && !isAuthor) {
        await interaction.reply({
            content: "Only the poll author or an admin can close this poll.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await closePoll(interaction.client, poll.id);
    await interaction.reply({ content: "Poll closed.", flags: MessageFlags.Ephemeral });
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("message_id", true);
    const [poll] = await db.select().from(polls).where(eq(polls.messageId, messageId)).limit(1);

    if (!poll) {
        await interaction.reply({
            content: "No poll found with that message ID.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
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
    await interaction.reply({ content: "Poll deleted.", flags: MessageFlags.Ephemeral });
}

export default command;
