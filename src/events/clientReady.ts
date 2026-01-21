import { Events } from "discord.js";
import type { Event } from "../types.d.ts";

const event: Event<Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}`);

        // Proactively populate member caches so later lookups don't hit partials
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.fetch();
                console.log(`Cached ${guild.members.cache.size} members for guild ${guild.name}`);
            } catch (error) {
                console.error(
                    `Failed to cache members for guild ${guild.id}:`,
                    error,
                );
            }
        }
    },
};

export default event;
