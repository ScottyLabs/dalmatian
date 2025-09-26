import { Client, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong! and latency."),
  execute: async (interaction) => {
    await interaction.reply(
      `Pong! Latency is ${Date.now() - interaction.createdTimestamp} ms.`,
    );
  },
};

export default command;
