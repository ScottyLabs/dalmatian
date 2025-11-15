import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.d.ts";

const command: Command = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong! and latency."),
    async execute(interaction) {
        await interaction.reply("Pinging...");

        const reply = await interaction.fetchReply();

        const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
        const wsPing = interaction.client.ws.ping;

        const embed = new EmbedBuilder()
            .setTitle("🏓 Pong!")
            .setDescription("Here are the current latency statistics:")
            .addFields(
                {
                    name: "Roundtrip",
                    value: `${roundTrip}ms`,
                    inline: true,
                },
                {
                    name: "Heartbeat",
                    value: `${wsPing}ms`,
                    inline: true,
                },
            )
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
        });
    },
};

export default command;
