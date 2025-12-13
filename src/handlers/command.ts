import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
    type Client,
    type ContextMenuCommandBuilder,
    REST,
    Routes,
    type SlashCommandBuilder,
} from "discord.js";
import type { Command, ContextCommand } from "../types.d.ts";

export default (client: Client) => {
    const commands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];

    const commandsDir = join(__dirname, "../commands");
    readdirSync(commandsDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;
        const command: Command = require(join(commandsDir, file)).default;
        commands.push(command.data);
        client.commands.set(command.data.name, command);
    });

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log("Started refreshing application (/) commands.");

            await rest
                .put(
                    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                    {
                        body: commands.map((command) => command.toJSON()),
                    },
                )
                .then((data: unknown) => {
                    const commandCount = Array.isArray(data)
                        ? data.length
                        : "unknown";
                    console.log(
                        `Successfully reloaded ${commandCount} application (/) commands.`,
                    );
                });
        } catch (error: unknown) {
            console.error(
                error instanceof Error ? error.message : String(error),
            );
        }
    })().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
    });

    const contextCommands: Pick<
        ContextMenuCommandBuilder,
        "name" | "toJSON"
    >[] = [];

    const contextDir = join(__dirname, "../contextCommands");
    readdirSync(contextDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;

        const command: ContextCommand = require(join(contextDir, file)).default;
        contextCommands.push(command.data);
        client.contextCommands.set(command.data.name, command);
    });

    (async () => {
        try {
            console.log("Started refreshing global context menu commands...");

            await rest
                .put(
                    Routes.applicationGuildCommands(
                        process.env.DISCORD_CLIENT_ID,
                        "1449512254541139980",
                    ),
                    {
                        body: contextCommands.map((command) =>
                            command.toJSON(),
                        ),
                    },
                )
                .then((data: unknown) => {
                    const commandCount = Array.isArray(data)
                        ? data.length
                        : "unknown";
                    console.log(
                        `Successfully reloaded ${commandCount} global context menu commands.`,
                    );
                });
        } catch (error: unknown) {
            console.error(
                error instanceof Error ? error.message : String(error),
            );
        }
    })().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
    });
};
