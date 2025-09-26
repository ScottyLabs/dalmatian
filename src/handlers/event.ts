import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "discord.js";
import type { Event } from "../types";

module.exports = (client: Client) => {
  const eventsDir = join(__dirname, "../events");

  readdirSync(eventsDir).forEach((file) => {
    if (!file.endsWith(".js")) return;
    const event: Event = require(join(eventsDir, file)).default;
    event.once
      ? client.once(event.name, (...args) => event.execute(client, ...args))
      : client.on(event.name, (...args) => event.execute(client, ...args));
    console.log(`Loaded event ${event.name}`);
  });
};
