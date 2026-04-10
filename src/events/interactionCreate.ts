import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Client,
    Events,
    InteractionType,
    MessageFlags,
    type StringSelectMenuInteraction,
    type UserContextMenuCommandInteraction,
} from "discord.js";
import type { Event } from "../types.d.ts";
import { handlePollVote } from "../utils/pollVotes.ts";

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
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith("poll:vote:")) {
                try {
                    await handlePollVote(
                        interaction as StringSelectMenuInteraction,
                    );
                } catch (error) {
                    console.error("Error handling poll vote:", error);
                    await interaction.reply({
                        content: "Failed to record your vote.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        } else if (interaction.isUserContextMenuCommand()) {
            const command = client.contextCommands.get(interaction.commandName);
            if (!command) {
                console.error(
                    `No context command matching "${interaction.commandName}" found`,
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
