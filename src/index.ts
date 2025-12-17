import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { ContextCommand, SlashCommand } from "./types.d.ts";

const { Guilds, GuildMembers, GuildMessages, GuildMessageReactions } =
	GatewayIntentBits;

declare module "discord.js" {
    interface Client {
        slashCommands: Collection<string, SlashCommand>;
        contextCommands: Collection<string, ContextCommand>;
    }
}

const client = new Client({
    intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions],
});

client.slashCommands = new Collection();
client.contextCommands = new Collection();

const handlersDir = join(__dirname, "./handlers");
readdirSync(handlersDir).forEach(async (handler) => {
    if (!handler.endsWith(".ts")) return;

    try {
        const mod = await import(join(handlersDir, handler));
        const fn = mod.default ?? mod;
        if (typeof fn === "function") fn(client);
    } catch (err) {
        console.error(`Failed to load handler ${handler}:`, err);
    }
});

await client.login(process.env.DISCORD_TOKEN);
