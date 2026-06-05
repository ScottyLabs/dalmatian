import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
    type Client,
    type ContextMenuCommandBuilder,
    REST,
    Routes,
    type SlashCommandBuilder,
} from "discord.js";
import type { ContextCommand, SlashCommand } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";

const handlersDir = import.meta.dirname;

async function loadSlashCommands(
    client: Client,
): Promise<Pick<SlashCommandBuilder, "name" | "toJSON">[]> {
    const slashCommands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];
    const slashCommandsDir = join(handlersDir, "../commands");

    for (const file of readdirSync(slashCommandsDir).sort()) {
        if (!file.endsWith(".ts")) continue;

        try {
            const mod = await import(join(slashCommandsDir, file));
            const command = (mod.default ?? mod) as SlashCommand;
            slashCommands.push(command.data);
            client.slashCommands.set(command.data.name, command);
        } catch (error) {
            logger.error(`Failed to load slash command ${file}: ${nodeError(error).message}`);
        }
    }

    return slashCommands;
}

async function loadContextCommands(
    client: Client,
): Promise<Pick<ContextMenuCommandBuilder, "name" | "toJSON">[]> {
    const contextCommands: Pick<ContextMenuCommandBuilder, "name" | "toJSON">[] = [];
    const contextCommandsDir = join(handlersDir, "../contextCommands");

    for (const file of readdirSync(contextCommandsDir).sort()) {
        if (!file.endsWith(".ts")) continue;

        try {
            const mod = await import(join(contextCommandsDir, file));
            const command = (mod.default ?? mod) as ContextCommand;
            contextCommands.push(command.data);
            client.contextCommands.set(command.data.name, command);
        } catch (error) {
            logger.error(`Failed to load context command ${file}: ${nodeError(error).message}`);
        }
    }

    return contextCommands;
}

export default async (client: Client) => {
    const slashCommands = await loadSlashCommands(client);
    const contextCommands = await loadContextCommands(client);

    logger.info(
        `Loaded ${slashCommands.length} slash commands and ${contextCommands.length} context commands`,
    );

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        logger.info("Started refreshing application commands.");

        const allCommands = [
            ...slashCommands.map((command) => command.toJSON()),
            ...contextCommands.map((command) => command.toJSON()),
        ];

        const data = await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
            body: allCommands,
        });

        const commandCount = Array.isArray(data) ? data.length : "unknown";
        logger.info(
            `Successfully reloaded ${commandCount} application commands (${slashCommands.length} slash, ${contextCommands.length} context menu).`,
        );
    } catch (error) {
        logger.error(`Failed to refresh application commands: ${nodeError(error).message}`);
    }
};
