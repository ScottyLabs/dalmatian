import {
  ChatInputCommandInteraction,
  ClientEvents,
  SlashCommandBuilder,
} from "discord.js";

//TODO: add text commands to this interface
export interface Command {
  data: Pick<SlashCommandBuilder, "name" | "toJSON">;
  execute: (interaction: ChatInputCommandInteraction) => void;
}

export interface Event<K extends keyof ClientEvents> {
  name: K;
  once: boolean;
  execute: (...args: ClientEvents[K]) => void;
}
