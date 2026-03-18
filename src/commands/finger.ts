import { createConnection } from "node:net";
import {
    codeBlock,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";

const DEFAULT_HOST = "andrew.cmu.edu";

function finger(user: string, host: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = createConnection({ host, port: 79 }, () => {
            socket.write(`${user}\r\n`);
        });

        const chunks: Buffer[] = [];

        socket.on("data", (data: Buffer) => {
            chunks.push(data);
        });

        socket.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf-8"));
        });

        socket.on("error", (err: Error) => {
            reject(err);
        });

        socket.setTimeout(10_000, () => {
            socket.destroy();
            reject(new Error("Connection timed out"));
        });
    });
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("finger")
        .setDescription("Look up a user via the finger protocol")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription(
                    "Username or user@host (defaults to @andrew.cmu.edu)",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        const query = interaction.options.getString("query", true).trim();

        let user: string;
        let host: string;

        if (query.includes("@")) {
            const atIndex = query.indexOf("@");
            user = query.slice(0, atIndex);
            host = query.slice(atIndex + 1);
        } else {
            user = query;
            host = DEFAULT_HOST;
        }

        if (!host) {
            return interaction.reply({
                content: "Invalid query: no host specified after @.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            const result = await finger(user, host);
            const trimmed = result.trimEnd();

            if (!trimmed) {
                return interaction.editReply({
                    content: `No finger information found for \`${user}@${host}\`.`,
                });
            }

            const truncated =
                trimmed.length > 4000
                    ? `${trimmed.slice(0, 4000)}...`
                    : trimmed;

            const embed = new EmbedBuilder()
                .setTitle(`${user}@${host}`)
                .setColor(0xa7192e)
                .setDescription(codeBlock(truncated));

            return interaction.editReply({ embeds: [embed] });
        } catch {
            return interaction.editReply({
                content: `Failed to reach \`${host}\` on port 79. The server may not support the finger protocol.`,
            });
        }
    },
};

export default command;
