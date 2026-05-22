import { Events } from "discord.js";
import type { Event } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";

const event: Event<Events.GuildCreate> = {
    name: Events.GuildCreate,
    once: false,
    async execute(guild) {
        try {
            await guild.members.fetch();
            logger.info(
                `Cached ${guild.members.cache.size} members for guild ${guild.name}`,
            );
        } catch (error) {
            logger.error(
                `Failed to cache members for guild ${guild.id}:`,
                nodeError(error),
            );
        }
    },
};

export default event;
