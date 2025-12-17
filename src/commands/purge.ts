import {
    BaseGuildTextChannel,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";

async function purgeMessages(
    channel: BaseGuildTextChannel,
    count: number,
    filter?: (message: Message<true>) => boolean,
): Promise<Message<true>[]> {
    let remaining = count;
    let deletedMessages: Message<true>[] = [];

    while (remaining > 0) {
        const numDelete = Math.min(remaining, 100);
        const messages = await channel.messages.fetch({
            limit: numDelete,
        });

        if (messages.size == 0) {
            break;
        }

        const toDelete = messages.filter(
            (m): m is Message<true> =>
                !!m && !m.partial && (!filter || filter(m)),
        );

        if (toDelete.size === 0) {
            break;
        }

        const deleted = await channel.bulkDelete(toDelete, true);

        deletedMessages.push(
            ...Array.from(deleted.values()).filter(
                (m): m is Message<true> => !!m && !m.partial,
            ),
        );

        remaining -= deleted.size;

        if (deleted.size === 0) break;
    }

    while (remaining > 0) {
        const numDelete = Math.min(remaining, 100);
        const messages = await channel.messages.fetch({
            limit: numDelete,
        });
        if (messages.size === 0) break;

        const toDelete = messages.filter(
            (m): m is Message<true> =>
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
        .setDescription("removes messages in channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("all")
                .setDescription(
                    "removes all messages newer than 2 weeks up to 100",
                )
                .addIntegerOption((option) =>
                    option
                        .setName("count")
                        .setDescription("Number of messages to delete")
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("user")
                .setDescription("removes all messages from a user")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("User to remove messages from")
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("count")
                        .setDescription("Number of messages to delete")
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        const channel = interaction.channel;

        if (!channel || !(channel instanceof BaseGuildTextChannel)) {
            return interaction.reply({
                content: "Not valid text channel",
                flags: MessageFlags.Ephemeral,
            });
        }

        const count = Number(interaction.options.getInteger("count"));
        if (count < 1) {
            return interaction.editReply(`invalid count`);
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let deletedMessages: Message<true>[] = [];

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
            `Purged ${deletedMessages.length} messages`,
        );
    },
};

export default command;
