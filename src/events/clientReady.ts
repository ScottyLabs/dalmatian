import { Client } from 'discord.js';
import { Event } from '../types';

const event : Event = {
  name: 'clientReady',
  once: true,
  execute: (client: Client) => {
    console.log(`Logged in as ${client.user?.tag}`);
  }
};

export default event;