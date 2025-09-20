import { Client } from 'discord.js';
import { Command } from '../types';

const command : Command = {
  data: {
    name: 'ping',
    toJSON: () => ({ name: 'ping', description: 'returns ping of bot' })
  },
  execute: async (interaction) => {
    await interaction.reply(`Pong! Latency is ${Date.now() - interaction.createdTimestamp}ms.`);
  }
}

export default command;