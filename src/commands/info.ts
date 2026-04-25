import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.js";
import ms from "ms";
import { z } from "zod";
import { DEFAULT_EMBED_COLOR } from "../constants.js";

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
    data: new SlashCommandBuilder()
        .setName("info")
        .setDescription("Get information about the bot"),
    async execute(interaction) {
        await interaction.deferReply();

        const commitRaw = await fetch(
            "https://api.github.com/repos/scottylabs/dalmatian/commits",
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
                .filter(
                    (
                        c,
                    ): c is typeof c & {
                        author: NonNullable<typeof c.author>;
                    } => c.author != null,
                )
                .map((c) => ({
                    username: c.author.login,
                    url: c.author.html_url,
                }))
                .filter(
                    (value, index, self) =>
                        index ===
                        self.findIndex((t) => t.username === value.username),
                )
                .slice(0, 5); //top 5 max

            contributors =
                latestContributors.length > 0
                    ? latestContributors
                          .map((c) => `[${c.username}](${c.url})`)
                          .join(", ")
                    : "No contributors in the last 7 days";
        }

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
                        (process.env["COMMIT_HASH"]
                            ? `\n\n-# commit [\`${process.env["COMMIT_HASH"].slice(0, 7)}\`](https://github.com/ScottyLabs/dalmatian/commit/${process.env["COMMIT_HASH"]})`
                            : ""),
                },
            );

        const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel("Github Repo")
                .setStyle(ButtonStyle.Link)
                .setURL("https://github.com/ScottyLabs/dalmatian"),
            new ButtonBuilder()
                .setLabel("Bug Report")
                .setStyle(ButtonStyle.Link)
                .setURL("https://github.com/ScottyLabs/dalmatian/issues/new"),
        );

        await interaction.followUp({
            embeds: [embed],
            components: [components],
        });
    },
};

export default command;
