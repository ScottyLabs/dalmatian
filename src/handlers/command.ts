import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  type Client,
  REST,
  Routes,
  type SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types";

module.exports = (client: Client) => {
  const commands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];

  const commandsDir = join(__dirname, "../commands");
  readdirSync(commandsDir).forEach((file) => {
    if (!file.endsWith(".js")) return;
    const command: Command = require(join(commandsDir, file)).default;
    commands.push(command.data);
    client.commands.set(command.data.name, command);
  });

  const rest = new REST().setToken(process.env.TOKEN as string);

  (async () => {
    try {
      console.log("Started refreshing application (/) commands.");

      await rest
        .put(Routes.applicationCommands(process.env.CLIENT_ID as string), {
          body: commands.map((command) => command.toJSON()),
        })
        .then((data: any) => {
          return console.log(
            `Successfully reloaded ${data.length} application (/) commands.`,
          );
        });
    } catch (error: any) {
      console.error(error);
    }
  })();
};
