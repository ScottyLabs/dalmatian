import { Client } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import { Event } from "../types";

module.exports = (client: Client) => {
  const eventsDir = join(__dirname, '../events');

  readdirSync(eventsDir).forEach((file) => {
    if (!file.endsWith('.js')) return;
    const event: Event = require(join(eventsDir, file)).default;
    event.once ?
      client.once(event.name, (...args) => event.execute(client, ...args)) :
      client.on(event.name, (...args) => event.execute(client, ...args));
    console.log(`Loaded event ${event.name}`);
  });
}