import {
    type ChatInputCommandInteraction,
    Events,
    InteractionType,
} from "discord.js";
import type { Event } from "../types";

const event: Event<Events.InteractionCreate> = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        if (!interaction.isChatInputCommand() && !interaction.isAutocomplete())
            return;

        const command = interaction.client.commands.get(
            interaction.commandName,
        );
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
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }

        if (
            interaction.type ===
                InteractionType.ApplicationCommandAutocomplete &&
            command.autocomplete
        ) {
            try {
                await command.autocomplete(interaction.client, interaction);
            } catch (error) {
                console.error(error);
            }
        }
    },
};

export default event;
