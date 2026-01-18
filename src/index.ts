import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
    Client,
    Collection,
    EmbedBuilder,
    GatewayIntentBits,
} from "discord.js";
import { DEFAULT_EMBED_COLOR } from "./constants.ts";
import { runMigrations } from "./db/migrate.ts";
import type { ContextCommand, SlashCommand } from "./types.d.ts";

await runMigrations();

declare module "discord.js" {
    interface Client {
        slashCommands: Collection<string, SlashCommand>;
        contextCommands: Collection<string, ContextCommand>;
    }
}

const { Guilds, GuildMembers, GuildMessages, GuildMessageReactions } =
    GatewayIntentBits;

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

// eslint-disable-next-line @typescript-eslint/unbound-method
const origToJSON = EmbedBuilder.prototype.toJSON;

EmbedBuilder.prototype.toJSON = function (this: EmbedBuilder) {
    if (this.data.color == undefined) {
        this.setColor(DEFAULT_EMBED_COLOR);
    }
    return origToJSON.call(this);
};

await client.login(process.env.DISCORD_TOKEN);
