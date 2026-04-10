import {
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    Client,
    Events,
    InteractionType,
    type MessageContextMenuCommandInteraction,
    MessageFlags,
    type StringSelectMenuInteraction,
    type UserContextMenuCommandInteraction,
} from "discord.js";
import type { Event, MessageContextCommand, UserContextCommand } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";
import { handlePollVote } from "../utils/pollVotes.ts";

const event: Event<Events.InteractionCreate> = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        const client = interaction.client as Client;

        if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command) {
                logger.warn(
                    `No command matching "${interaction.commandName}" in memory (loaded: ${[...client.slashCommands.keys()].join(", ")})`,
                );
                return;
            }

            if (interaction.type === InteractionType.ApplicationCommand) {
                try {
                    await command.execute(interaction as ChatInputCommandInteraction);

                    logger.info(
                        `Executed command "${interaction.commandName}" for user ${interaction.user.tag}`,
                    );
                } catch (error) {
                    logger.error("Error executing command:", nodeError(error));
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({
                            content: "There was an error while executing this command!",
                        });
                    } else
                        await interaction.reply({
                            content: "There was an error while executing this command!",
                            flags: MessageFlags.Ephemeral,
                        });
                }
            }

            if (
                interaction.type === InteractionType.ApplicationCommandAutocomplete &&
                command.autocomplete
            ) {
                try {
                    await command.autocomplete(client, interaction as AutocompleteInteraction);
                } catch (error) {
                    logger.error("Error in autocomplete:", nodeError(error));
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
                logger.warn(
                    `No context command matching "${interaction.commandName}" in memory (loaded: ${[...client.contextCommands.keys()].join(", ")})`,
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

                logger.info(
                    `Executed context command "${interaction.commandName}" for user ${interaction.user.tag}`,
                );
            } catch (error) {
                logger.error("Error executing context command:", nodeError(error));
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        content: "There was an error while executing this context menu command!",
                    });
                } else {
                    await interaction.reply({
                        content: "There was an error while executing this context menu command!",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        }
    },
};

export default event;
