import { Client, Interaction, ChatInputCommandInteraction, InteractionType } from 'discord.js';
import { Command, Event } from '../types';

const event : Event = {
  name: 'interactionCreate',
  execute: async (client : Client, interaction : Interaction) => {
    if(interaction.type !== InteractionType.ApplicationCommand
      && interaction.type !== InteractionType.ApplicationCommandAutocomplete) return;

    const command : Command | undefined = client.commands.get(interaction.commandName);
    if(!command) return;

    if(interaction.type === InteractionType.ApplicationCommand) {
      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
    if(interaction.type === InteractionType.ApplicationCommandAutocomplete && command.autocomplete) {
      try {
        await command.autocomplete(client, interaction);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

export default event;