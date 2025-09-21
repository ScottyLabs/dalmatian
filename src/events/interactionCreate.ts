import { Client, Interaction, ChatInputCommandInteraction, InteractionType } from 'discord.js';
import { Command, Event } from '../types';

const event : Event = {
  name: 'interactionCreate',
  execute: async (client : Client, interaction : Interaction) => {
    if(interaction.type !== InteractionType.ApplicationCommand) return;

    const command : Command | undefined = client.commands.get(interaction.commandName);
    if(!command) return;

    try {
      await command.execute(interaction as ChatInputCommandInteraction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
}

export default event;