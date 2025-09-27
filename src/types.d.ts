import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ClientEvents,
  SlashCommandBuilder,
} from "discord.js";

//TODO: add text commands to this interface
export interface Command {
  data: Pick<SlashCommandBuilder, "name" | "toJSON">;
  execute: (interaction: ChatInputCommandInteraction) => void;
  autocomplete?: (client: Client, interaction: AutocompleteInteraction) => void;
}

export interface Event<K extends keyof ClientEvents> {
  name: K;
  once: boolean;
  execute: (...args: ClientEvents[K]) => void;
}
