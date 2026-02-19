import type {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ClientEvents,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    SlashCommandBuilder,
} from "discord.js";

export type CommandData<T extends SlashCommandBuilder | ContextMenuCommandBuilder> = Pick<T, "name" | "toJSON">;

export interface SlashCommand {
    data: CommandData<SlashCommandBuilder>;
    execute: (
        interaction: ChatInputCommandInteraction,
    ) => void | Promise<void>;
    autocomplete?: (
        client: Client,
        interaction: AutocompleteInteraction,
    ) => void | Promise<void>;
}

export interface UserContextCommand {
    data: CommandData<ContextMenuCommandBuilder>;
    execute: (
        interaction: ContextMenuCommandInteraction,
    ) => void | Promise<void>;
}

export type Command = SlashCommand | UserContextCommand;

export interface Event<K extends keyof ClientEvents> {
    name: K;
    once: boolean;
    execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

