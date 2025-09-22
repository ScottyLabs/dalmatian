import { SlashCommandBuilder, ChatInputCommandInteraction, Client, AutocompleteInteraction }  from 'discord.js';

//TODO: add text commands to this interface
export interface Command {
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  execute: (interaction: ChatInputCommandInteraction) => void;
  autocomplete?: (client: Client, interaction: AutocompleteInteraction) => void;
}

export interface Event {
  name: string;
  once?: boolean | false;
  execute: (...args: any[]) => void;
}