import { Events } from "discord.js";
import type { Event } from "../types.d.ts";

const event: Event<Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Logged in as ${client.user.tag}`);
    },
};

export default event;
