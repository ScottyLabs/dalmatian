import { Events } from "discord.js";
import { Event } from "../types";

const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
  },
};

export default event;
