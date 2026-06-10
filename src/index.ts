import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client, Collection, EmbedBuilder, GatewayIntentBits, Options, Partials } from "discord.js";
import { DEFAULT_EMBED_COLOR } from "./constants.ts";
import { runMigrations } from "./db/migrate.ts";
import type { ContextCommand, SlashCommand } from "./types.d.ts";
import { configureLogger, logger, nodeError } from "./utils/log.ts";

await configureLogger();

await runMigrations();

declare module "discord.js" {
    interface Client {
        slashCommands: Collection<string, SlashCommand>;
        contextCommands: Collection<string, ContextCommand>;
    }
}

const { Guilds, GuildMembers, GuildMessages, GuildMessageReactions } = GatewayIntentBits;

const client = new Client({
    intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions],
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember],
    makeCache: Options.cacheEverything(),
});

client.slashCommands = new Collection();
client.contextCommands = new Collection();

const handlersDir = join(import.meta.dirname!, "./handlers");
const handlerFiles = readdirSync(handlersDir)
    .filter((handler) => handler.endsWith(".ts"))
    .sort();

for (const handler of handlerFiles) {
    try {
        const mod = await import(join(handlersDir, handler));
        const fn = mod.default ?? mod;
        if (typeof fn === "function") {
            await fn(client);
        }
    } catch (err) {
        logger.error(`Failed to load handler ${handler}: ${nodeError(err).message}`);
    }
}

// eslint-disable-next-line @typescript-eslint/unbound-method
const origToJSON = EmbedBuilder.prototype.toJSON;

EmbedBuilder.prototype.toJSON = function (this: EmbedBuilder) {
    if (this.data.color == undefined) {
        this.setColor(DEFAULT_EMBED_COLOR);
    }
    return origToJSON.call(this);
};

await client.login(Deno.env.get("DISCORD_TOKEN")!);
