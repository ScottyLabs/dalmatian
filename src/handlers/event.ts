import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client, ClientEvents } from "discord.js";
import type { Event } from "../types.d.ts";

export default (client: Client) => {
    const eventsDir = join(__dirname, "../events");

    readdirSync(eventsDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;

        const event = require(join(eventsDir, file)).default as Event<
            keyof ClientEvents
        >;

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`Loaded event ${event.name}`);
    });
};
