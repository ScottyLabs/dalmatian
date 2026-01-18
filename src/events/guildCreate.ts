import { Events } from "discord.js";
import type { Event } from "../types.d.ts";

const event: Event<Events.GuildCreate> = {
    name: Events.GuildCreate,
    once: false,
    async execute(guild) {
        try {
            await guild.members.fetch();
            console.log(`Cached members for guild ${guild.name}`);
        } catch (error) {
            console.error(
                `Failed to cache members for guild ${guild.id}:`,
                error,
            );
        }
    },
};

export default event;
