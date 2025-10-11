import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types";

const command: Command = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong! and latency."),
    async execute(interaction) {
        await interaction.reply(
            `Pong! Latency is ${Date.now() - interaction.createdTimestamp} ms.`,
        );
    },
};

export default command;
