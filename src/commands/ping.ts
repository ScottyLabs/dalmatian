import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.d.ts";

const command: Command = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong! and latency."),
    async execute(interaction) {
        const embed0 = new EmbedBuilder().setTitle("Pinging...");

        await interaction.reply({
            embeds: [embed0],
        });

        const reply = await interaction.fetchReply();

        const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;

        const embed = new EmbedBuilder().setTitle("🏓 Pong!").addFields(
            {
                name: "Roundtrip",
                value: `${roundTrip} ms`,
                inline: true,
            },
            {
                name: "Ping",
                value:
                    interaction.client.ws.ping > 0
                        ? `${interaction.client.ws.ping} ms`
                        : "Try Again Later...",
                inline: true,
            },
        );

        await interaction.editReply({
            embeds: [embed],
        });
    },
};

export default command;
