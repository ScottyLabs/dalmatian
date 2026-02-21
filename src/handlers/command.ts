import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
    type Client,
    REST,
    Routes,
} from "discord.js";
import type { Command, CommandDataGeneric } from "../types.d.ts";

export default (client: Client) => {
    const commands: CommandDataGeneric[] = [];

    const commandsDir = join(__dirname, "../commands");
    const loadCommandsFromDir = (dirPath: string) => {
        readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
            if (entry.isDirectory()) {
                loadCommandsFromDir(join(dirPath, entry.name));
                return;
            }

            if (!entry.name.endsWith(".ts")) return;
            const command: Command = require(
                join(dirPath, entry.name),
            ).default;
            if (!command) return;
            commands.push(command.data);
            client.commands.set(command.data.name, command);
        });
    };

    loadCommandsFromDir(commandsDir);

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log("Started refreshing application commands.");

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
                        `Successfully reloaded ${commands.length} application commands.`,
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
