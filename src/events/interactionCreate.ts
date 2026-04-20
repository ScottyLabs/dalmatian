import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Client,
    Events,
    InteractionType,
    type MessageContextMenuCommandInteraction,
    MessageFlags,
    type UserContextMenuCommandInteraction,
} from "discord.js";
import type {
    Event,
    MessageContextCommand,
    UserContextCommand,
} from "../types.d.ts";

const event: Event<Events.InteractionCreate> = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        const client = interaction.client as Client;

        if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command) {
                console.error(
                    `No command matching "${interaction.commandName}" found`,
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
        } else if (
            interaction.isUserContextMenuCommand() ||
            interaction.isMessageContextMenuCommand()
        ) {
            const command = client.contextCommands.get(interaction.commandName);
            if (!command) {
                console.error(
                    `No context command matching "${interaction.commandName}" found`,
                );
                return;
            }

            try {
                if (interaction.isMessageContextMenuCommand()) {
                    await (command as MessageContextCommand).execute(
                        interaction as MessageContextMenuCommandInteraction,
                    );
                } else {
                    await (command as UserContextCommand).execute(
                        interaction as UserContextMenuCommandInteraction,
                    );
                }
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
