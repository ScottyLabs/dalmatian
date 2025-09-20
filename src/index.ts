import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { join } from 'path';
import { readdirSync } from 'fs';
import { Command } from './types';
import { config } from 'dotenv';
const { Guilds, GuildMembers, GuildMessages } = GatewayIntentBits;

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages],
})

client.commands = new Collection();

const handlersDir = join(__dirname, './handlers');
readdirSync(handlersDir).forEach(handler => {
  if(!handler.endsWith('.js')) return;
  require(`${handlersDir}/${handler}`)(client);
});

config();
client.login(process.env.TOKEN);