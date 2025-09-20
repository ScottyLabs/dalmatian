import { Client, Interaction } from 'discord.js';
import { Command, Event } from '../types';

const event : Event = {
  name: 'interactionCreate',
  execute: async (client : Client, interaction : Interaction) => {
    if(!interaction.isCommand()) return;

    const command : Command | undefined = client.commands.get(interaction.commandName);
    if(!command) return;

    try {
      await command?.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
}

export default event;