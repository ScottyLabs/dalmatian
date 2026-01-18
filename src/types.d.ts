import type {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ClientEvents,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    SlashCommandBuilder,
} from "discord.js";

// TODO: add text commands to this interface
export interface SlashCommand {
    data: Pick<SlashCommandBuilder, "name" | "toJSON">;
    execute: (
        interaction: ChatInputCommandInteraction,
    ) => void | Promise<unknown>;
    autocomplete?: (
        client: Client,
        interaction: AutocompleteInteraction,
    ) => void | Promise<void>;
}

export interface Event<K extends keyof ClientEvents> {
    name: K;
    once: boolean;
    execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

export interface UserContextCommand {
    data: Pick<ContextMenuCommandBuilder, "name" | "toJSON">;
    execute: (
        interaction: UserContextMenuCommandInteraction,
    ) => void | Promise<void>;
}
export interface MessageContextCommand {
    data: Pick<ContextMenuCommandBuilder, "name" | "toJSON">;
    execute: (
        interaction: MessageContextMenuCommandInteraction,
    ) => void | Promise<void>;
}

export type ContextCommand = UserContextCommand | MessageContextCommand;
