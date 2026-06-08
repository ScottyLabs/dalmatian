import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client, ClientEvents } from "discord.js";
import type { Event } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";

const handlersDir = import.meta.dirname!;

export default async (client: Client) => {
    const eventsDir = join(handlersDir, "../events");

    for (const file of readdirSync(eventsDir).sort()) {
        if (!file.endsWith(".ts")) continue;

        try {
            const mod = await import(join(eventsDir, file));
            const event = (mod.default ?? mod) as Event<keyof ClientEvents>;

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
            logger.info(`Loaded event ${String(event.name)}`);
        } catch (error) {
            logger.error(`Failed to load event ${file}: ${nodeError(error).message}`);
        }
    }
};
