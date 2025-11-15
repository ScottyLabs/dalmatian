import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.d.ts";

const command: Command = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong! and latency."),
    async execute(interaction) {
        const reply = await interaction.reply({
            content: "🏓 Pinging…",
            fetchReply: true,
        });

        const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
        const wsPing = interaction.client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor("#5A9EC9")
            .setTitle("🏓 Pong!")
            .setDescription("Here are the current latency statistics:")
            .addFields(
                {
                    name: "📡 Roundtrip Latency",
                    value: `\`${roundTrip}ms\``,
                    inline: true,
                },
                {
                    name: "🌐 WebSocket Ping",
                    value: `\`${wsPing}ms\``,
                    inline: true,
                },
            )
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

        await interaction.editReply({
            content: "",
            embeds: [embed],
        });
    },
};

export default command;
