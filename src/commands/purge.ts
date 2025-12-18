import {
    BaseGuildTextChannel,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";

type GuildMessage = Message<true>;

async function purgeMessages(
    channel: BaseGuildTextChannel,
    count: number,
    filter?: (message: GuildMessage) => boolean,
): Promise<GuildMessage[]> {
    let lastMessageId: string | undefined;
    let remaining = count;
    let deletedMessages: GuildMessage[] = [];

    while (remaining > 0) {
        const numDelete = Math.min(remaining, 100);
        const messages = await channel.messages.fetch({
            limit: numDelete,
            before: lastMessageId,
        });
        lastMessageId = messages.last()?.id;

        if (messages.size === 0) {
            break;
        }

        const toDelete = messages.filter(
            (m): m is GuildMessage =>
                !!m && !m.partial && (!filter || filter(m)),
        );

        if (toDelete.size === 0) {
            continue;
        }

        const deleted = await channel.bulkDelete(toDelete, true);

        deletedMessages.push(
            ...Array.from(deleted.values()).filter(
                (m): m is GuildMessage => !!m && !m.partial,
            ),
        );

        remaining -= deleted.size;

        if (deleted.size === 0) {
            break;
        }
    }

    while (remaining > 0) {
        const numDelete = Math.min(remaining, 100);
        const messages = await channel.messages.fetch({
            limit: numDelete,
            before: lastMessageId,
        });
        lastMessageId = messages.last()?.id;

        if (messages.size === 0) continue;

        const toDelete = messages.filter(
            (m): m is GuildMessage =>
                !!m && !m.partial && (!filter || filter(m)),
        );

        if (toDelete.size === 0) break;

        for (const message of toDelete.values()) {
            await message.delete();
            deletedMessages.push(message);
            remaining--;
            if (remaining <= 0) break;
        }
    }

    return deletedMessages;
}

// Command for purging messages in a channel with bulk delete
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Removes messages in channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("all")
                .setDescription("Removes all messages up to a count")
                .addIntegerOption((option) =>
                    option
                        .setName("count")
                        .setDescription(
                            "Number of messages to delete (max: 500)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("user")
                .setDescription("Removes all messages from a user")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("User to remove messages from")
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("count")
                        .setDescription(
                            "Number of messages to delete (max: 500)",
                        )
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        const channel = interaction.channel;

        if (!channel || !(channel instanceof BaseGuildTextChannel)) {
            return interaction.reply({
                content: "Not a valid text channel.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const count = Number(interaction.options.getInteger("count"));
        if (count < 1 || count > 500) {
            return interaction.reply({
                content: "Invalid message count, must be between 1 and 500.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let deletedMessages: GuildMessage[] = [];

        // given num of messages deleted bulk delete messages before switching to one by one
        if (interaction.options.getSubcommand() === "all") {
            deletedMessages = await purgeMessages(channel, count);
        }

        // given user purgeMessages based on user filter
        if (interaction.options.getSubcommand() === "user") {
            const user = interaction.options.getUser("user", true);
            deletedMessages = await purgeMessages(
                channel,
                count,
                (m) => !!m.author && m.author.id === user.id,
            );
        }

        return interaction.editReply(
            `Purged ${deletedMessages.length} messages.`,
        );
    },
};

export default command;
