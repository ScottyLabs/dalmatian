import { Events } from "discord.js";
import type { Event } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";

const event: Event<Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`Logged in as ${client.user.tag}`);

        // Proactively populate member caches so later lookups don't hit partials
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.fetch();
                logger.info(`Cached ${guild.members.cache.size} members for guild ${guild.name}`);
            } catch (error) {
                logger.error(`Failed to cache members for guild ${guild.id}:`, nodeError(error));
            }
        }
    },
};

export default event;
