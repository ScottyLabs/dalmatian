import { SlashCommandBuilder, ChatInputCommandInteraction, Client }  from 'discord.js';

//TODO: add text commands to this interface
export interface Command {
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  execute: (interaction: ChatInputCommandInteraction) => void;
}

export interface Event {
  name: string;
  once?: boolean | false;
  execute: (...args: any[]) => void;
}