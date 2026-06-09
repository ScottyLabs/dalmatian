import { codeBlock, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../types.d.ts";

const DEFAULT_HOST = "andrew.cmu.edu";

async function finger(user: string, host: string): Promise<string> {
    const conn = await Deno.connect({ hostname: host, port: 79 });

    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        conn.close();
    }, 10_000);

    try {
        await conn.write(new TextEncoder().encode(`${user}\r\n`));
        return await new Response(conn.readable).text();
    } catch (err) {
        if (timedOut) throw new Error("Connection timed out");
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("finger")
        .setDescription("Look up a user via the finger protocol")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("Username or user@host (defaults to @andrew.cmu.edu)")
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

            const truncated = trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}...` : trimmed;

            const embed = new EmbedBuilder()
                .setTitle(`${user}@${host}`)
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
