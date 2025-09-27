import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { Command } from "./types";

const { Guilds, GuildMembers, GuildMessages } = GatewayIntentBits;

declare module "discord.js" {
  interface Client {
    commands: Collection<string, Command>;
  }
}

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages],
});

client.commands = new Collection();

const handlersDir = join(__dirname, "./handlers");
readdirSync(handlersDir).forEach((handler) => {
  if (!handler.endsWith(".js")) return;
  require(join(handlersDir, handler))(client);
});

client.login(process.env.DISCORD_TOKEN);
