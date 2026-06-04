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

export default (client: Client) => {
    const slashCommands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];

    const slashCommandsDir = join(__dirname, "../commands");
    readdirSync(slashCommandsDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;
        const command: SlashCommand = require(join(slashCommandsDir, file)).default;
        slashCommands.push(command.data);
        client.slashCommands.set(command.data.name, command);
    });

    const contextCommands: Pick<ContextMenuCommandBuilder, "name" | "toJSON">[] = [];

    const contextCommandsDir = join(__dirname, "../contextCommands");
    readdirSync(contextCommandsDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;
        const command: ContextCommand = require(join(contextCommandsDir, file)).default;
        contextCommands.push(command.data);
        client.contextCommands.set(command.data.name, command);
    });

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            logger.info("Started refreshing application commands.");

            const allCommands = [
                ...slashCommands.map((command) => command.toJSON()),
                ...contextCommands.map((command) => command.toJSON()),
            ];

            await rest
                .put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
                    body: allCommands,
                })
                .then((data: unknown) => {
                    const commandCount = Array.isArray(data) ? data.length : "unknown";
                    logger.info(
                        `Successfully reloaded ${commandCount} application commands (${slashCommands.length} slash, ${contextCommands.length} context menu).`,
                    );
                });
        } catch (error: unknown) {
            logger.error("Failed to refresh application commands:", nodeError(error));
        }
    })().catch((error: unknown) => {
        logger.error("Failed to refresh application commands:", nodeError(error));
    });
};
