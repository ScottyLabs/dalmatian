import { Client, REST, Routes, SlashCommandBuilder } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import { Command } from "../types";

module.exports = (client: Client) => {
  const commands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];

  const commandsDir = join(__dirname, "../commands");
  readdirSync(commandsDir).forEach((file) => {
    if (!file.endsWith(".js")) return;
    const command: Command = require(join(commandsDir, file)).default;
    commands.push(command.data);
    client.commands.set(command.data.name, command);
  });

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  (async () => {
    try {
      console.log("Started refreshing application (/) commands.");

      await rest
        .put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
          body: commands.map((command) => command.toJSON()),
        })
        .then((data: unknown) => {
          const commandCount = Array.isArray(data) ? data.length : "unknown";
          console.log(
            `Successfully reloaded ${commandCount} application (/) commands.`
          );
        });
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  })();
};
