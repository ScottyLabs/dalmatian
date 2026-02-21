import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Client,
    Events,
    InteractionType,
    MessageFlags,
    type UserContextMenuCommandInteraction,
} from "discord.js";
import type { Event, SlashCommand, UserContextCommand } from "../types.d.ts";

const isSlashCommand = (command: unknown): command is SlashCommand =>
    typeof command === "object" &&
    command !== null &&
    "autocomplete" in command;

const isUserContextCommand = (
    command: unknown,
): command is UserContextCommand => !isSlashCommand(command);

const event: Event<Events.InteractionCreate> = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        const client = interaction.client as Client;

        if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(
                    `No command matching "${interaction.commandName}" found`,
                );
                return;
            }

            if (!isSlashCommand(command)) {
                console.error(
                    `Command "${interaction.commandName}" is not a slash command`,
                );
                return;
            }

            if (interaction.type === InteractionType.ApplicationCommand) {
                try {
                    await command.execute(
                        interaction as ChatInputCommandInteraction,
                    );
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content:
                            "There was an error while executing this command!",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (
                interaction.type ===
                    InteractionType.ApplicationCommandAutocomplete &&
                command.autocomplete
            ) {
                try {
                    await command.autocomplete(
                        client,
                        interaction as AutocompleteInteraction,
                    );
                } catch (error) {
                    console.error(error);
                }
            }
        } else if (interaction.isUserContextMenuCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(
                    `No context command matching "${interaction.commandName}" found`,
                );
                return;
            }

            if (!isUserContextCommand(command)) {
                console.error(
                    `Command "${interaction.commandName}" is not a user context command`,
                );
                return;
            }

            try {
                await command.execute(
                    interaction as UserContextMenuCommandInteraction,
                );
            } catch (error) {
                console.error(error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content:
                            "There was an error while executing this context menu command!",
                    });
                } else {
                    await interaction.reply({
                        content:
                            "There was an error while executing this context menu command!",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        }
    },
};

export default event;
