import { Client, ClientEvents } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import { Event } from "../types";

module.exports = (client: Client) => {
  const eventsDir = join(__dirname, "../events");

  readdirSync(eventsDir).forEach((file) => {
    if (!file.endsWith(".js")) return;
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
