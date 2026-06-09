import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";
import ms from "ms";
import { z } from "zod";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import type { SlashCommand } from "../types.d.ts";

const commitSchema = z.array(
    z.object({
        author: z
            .object({
                login: z.string(),
                html_url: z.string().url(),
            })
            .nullable()
            .optional(),
        commit: z.object({
            committer: z.object({
                date: z.string(),
            }),
        }),
    }),
);

const command: SlashCommand = {
    data: new SlashCommandBuilder().setName("info").setDescription("Get information about the bot"),
    async execute(interaction) {
        await interaction.deferReply();

        const commitRaw = await fetch(
            "https://codeberg.org/api/v1/repos/ScottyLabs/dalmatian/commits",
        )
            .then((f) => f.json())
            .catch((_) => undefined);

        const commitResult = commitSchema.safeParse(commitRaw);

        let contributors = "Contributors could not be fetched!";
        if (commitResult.success) {
            const latestContributors = commitResult.data
                .filter(
                    (c) =>
                        new Date(c.commit.committer.date) >
                        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                ) //last 7 days
                .flatMap((c) =>
                    c.author ? [{ username: c.author.login, url: c.author.html_url }] : [],
                )
                .filter(
                    (value, index, self) =>
                        index === self.findIndex((t) => t.username === value.username),
                )
                .slice(0, 5); //top 5 max

            contributors =
                latestContributors.length > 0
                    ? latestContributors.map((c) => `[${c.username}](${c.url})`).join(", ")
                    : "No contributors in the last 7 days";
        }

        const commitHash = Deno.env.get("COMMIT_HASH");

        const embed = new EmbedBuilder()
            .setTitle("Info about dalmatian")
            .setColor(DEFAULT_EMBED_COLOR)
            .setThumbnail(interaction.client.user?.displayAvatarURL() || null)
            .addFields(
                {
                    name: "Uptime",
                    value: ms(Math.floor(process.uptime()) * 1000, {
                        long: true,
                    }),
                },
                {
                    name: "Total Servers",
                    value: `${interaction.client.guilds.cache.size}`,
                },
                {
                    name: "Total Users",
                    value: `${interaction.client.guilds.cache.reduce(
                        (acc, guild) => acc + guild.memberCount,
                        0,
                    )}`,
                },
                {
                    name: "Latest Contributors",
                    value:
                        contributors +
                        (commitHash
                            ? `\n\n-# commit [\`${commitHash.slice(0, 7)}\`](https://codeberg.org/ScottyLabs/dalmatian/commit/${commitHash})`
                            : ""),
                },
            );

        const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel("Codeberg Repo")
                .setStyle(ButtonStyle.Link)
                .setURL("https://codeberg.org/ScottyLabs/dalmatian"),
            new ButtonBuilder()
                .setLabel("Bug Report")
                .setStyle(ButtonStyle.Link)
                .setURL("https://codeberg.org/ScottyLabs/dalmatian/issues/new"),
        );

        await interaction.followUp({
            embeds: [embed],
            components: [components],
        });
    },
};

export default command;
