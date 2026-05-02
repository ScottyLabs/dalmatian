import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
    type APIApplicationCommandBasicOption,
    type Client,
    type ContextMenuCommandBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";
import type { ContextCommand, SlashCommand } from "../types.d.ts";

export default (client: Client) => {
    const slashCommands: Pick<SlashCommandBuilder, "name" | "toJSON">[] = [];
    const slashCommandsDir = join(__dirname, "../commands");

    function registerSlashCommand(command: SlashCommand, alias?: string) {
        const data = alias
            ? {
                  name: alias,
                  toJSON: () => ({
                      ...command.data.toJSON(),
                      name: alias,
                  }),
              }
            : command.data;

        slashCommands.push(data);
        client.slashCommands.set(data.name, command);
    }

    readdirSync(slashCommandsDir, { withFileTypes: true }).forEach((entry) => {
        if (!entry.isDirectory()) {
            if (!entry.name.endsWith(".ts")) return;
            const command: SlashCommand = require(
                join(slashCommandsDir, entry.name),
            ).default;
            registerSlashCommand(command);
            command.aliases?.forEach((alias) =>
                registerSlashCommand(command, alias),
            );
            return;
        }

        const subcommandsDir = join(slashCommandsDir, entry.name);
        const subcommands = readdirSync(subcommandsDir)
            .filter((file) => file.endsWith(".ts"))
            .map(
                (file) => require(join(subcommandsDir, file)).default,
            ) as SlashCommand[];
        if (subcommands.length === 0) return;

        subcommands.forEach((command) => {
            command.aliases?.forEach((alias) =>
                registerSlashCommand(command, alias),
            );
        });

        const subcommandMap = new Map(
            subcommands.map((cmd) => [cmd.data.name, cmd]),
        );

        const parentData: Pick<SlashCommandBuilder, "name" | "toJSON"> = {
            name: entry.name,
            toJSON: () => ({
                name: entry.name,
                description: `${entry.name} commands`,
                options: subcommands.map((command) => {
                    const { name, description, options } =
                        command.data.toJSON();

                    return {
                        type: 1,
                        name,
                        description,
                        options: options as
                            | APIApplicationCommandBasicOption[]
                            | undefined,
                    };
                }),
            }),
        };

        const parentCommand: SlashCommand = {
            data: parentData,
            async execute(interaction) {
                const subcommand = interaction.options.getSubcommand();
                const command = subcommandMap.get(subcommand);
                if (!command) {
                    throw new Error(
                        `No subcommand matching "${subcommand}" found`,
                    );
                }
                return command.execute(interaction);
            },
            async autocomplete(client, interaction) {
                const subcommand = interaction.options.getSubcommand();
                const command = subcommandMap.get(subcommand);
                if (!command?.autocomplete) return;
                return command.autocomplete(client, interaction);
            },
        };

        registerSlashCommand(parentCommand);
        return;
    });

    const contextCommands: Pick<
        ContextMenuCommandBuilder,
        "name" | "toJSON"
    >[] = [];

    const contextCommandsDir = join(__dirname, "../contextCommands");
    readdirSync(contextCommandsDir).forEach((file) => {
        if (!file.endsWith(".ts")) return;
        const command: ContextCommand = require(
            join(contextCommandsDir, file),
        ).default;
        contextCommands.push(command.data);
        client.contextCommands.set(command.data.name, command);
    });

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log("Started refreshing application commands.");

            const allCommands = [
                ...slashCommands.map((command) => command.toJSON()),
                ...contextCommands.map((command) => command.toJSON()),
            ];

            await rest
                .put(
                    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                    {
                        body: allCommands,
                    },
                )
                .then((data: unknown) => {
                    const commandCount = Array.isArray(data)
                        ? data.length
                        : "unknown";
                    console.log(
                        `Successfully reloaded ${commandCount} application commands (${slashCommands.length} slash, ${contextCommands.length} context menu).`,
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
