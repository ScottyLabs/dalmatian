import {
    bold,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    userMention,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { parseAndEvaluate } from "../utils/operatorParser.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Get numbers and members of roles")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("count")
                .setDescription("Get the number of members in a role")
                .addStringOption((option) =>
                    option
                        .setName("role_string")
                        .setDescription(
                            "The role(s) to get the member count of (e.g. role1 and (role2 or role3))",
                        )
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("members")
                .setDescription("Get the members in a role")
                .addStringOption((option) =>
                    option
                        .setName("role_string")
                        .setDescription(
                            "The role(s) to get the members of (e.g. role1 and (role2 or role3))",
                        )
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        ),
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "This command can only be used in a server.",
            });
        }

        //Check for member count mismatch, as Discord.js may slightly drift due to sharding behaviour
        await interaction.guild.fetch(); //discord.js dosen't guarantee we have up to date member count after shard reconnects, so we fetch the guild to get the latest member count, this is a non-expensive operation
        if (
            interaction.guild.members.cache.size < interaction.guild.memberCount
        ) {
            console.log(
                `Cache mismatch detected, refreshing member cache..., timestamp ${new Date().toISOString()}`,
            ); //TODO: Remove timestamp when we switch to a proper logger framework
            try {
                await interaction.guild.members.fetch();
                console.log(
                    `Updated member cache for guild ${interaction.guild.name} (${interaction.guild.id})`,
                );
            } catch (error) {
                console.error(
                    `Failed to update member cache for guild ${interaction.guild.id}:`,
                    error,
                );
            }
        }

        function lookup(roleName: string): GuildMember[] {
            const role = interaction.guild!.roles.cache.find(
                (r) => r.name === roleName,
            );

            if (!role) {
                throw new Error(`Role not found: ${roleName}`);
            }

            return role.members.map(
                (member) =>
                    ({
                        id: member.id,
                        displayName: member.displayName,
                        user: {
                            username: member.user.username,
                        },
                    }) as GuildMember,
            );
        }

        function universe(): GuildMember[] {
            return interaction.guild!.members.cache.map(
                (member) =>
                    ({
                        id: member.id,
                        displayName: member.displayName,
                        user: {
                            username: member.user.username,
                        },
                    }) as GuildMember,
            );
        }

        function equals(a: GuildMember, b: GuildMember): boolean {
            return a.id === b.id;
        }

        const roleString = interaction.options.getString("role_string", true);

        const singleRole = interaction.guild.roles.cache.find(
            (r) => r.name === roleString,
        );

        const roleColor = singleRole?.colors.primaryColor;

        let members: GuildMember[];
        try {
            members = parseAndEvaluate<string, GuildMember>(
                roleString,
                (value) => {
                    return value;
                },
                lookup,
                equals,
                universe,
            );
        } catch (error) {
            return interaction.reply({
                content: `${(error as Error).message}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.options.getSubcommand() === "members") {
            members.sort((a, b) => a.displayName.localeCompare(b.displayName));
            const membersCount = members.length;

            const embeds = [];
            let chunk = [];
            while (members.length > 0) {
                chunk.push(members.shift());
                if (chunk.length >= 20 || members.length === 0) {
                    const description =
                        bold(`${membersCount} members`) +
                        "\n" +
                        chunk
                            .map(
                                (member) =>
                                    `${userMention(member!.id)} (${member!.user.username})`,
                            )
                            .join("\n");

                    const embed = new EmbedBuilder()
                        .setTitle(`"${roleString}"`)
                        .setDescription(description);

                    if (roleColor) embed.setColor(roleColor);
                    embeds.push(embed);
                    chunk = [];
                }
            }

            if (embeds.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`"${roleString}"`)
                    .setDescription(`No members found.`);

                if (roleColor) embed.setColor(roleColor);
                embeds.push(embed);
            }

            const paginator = new EmbedPaginator({ pages: embeds });
            return paginator.send(interaction);
        }
        if (interaction.options.getSubcommand() === "count") {
            const embed = new EmbedBuilder()
                .setTitle(`"${roleString}"`)
                .setDescription(`${members.length} members`);

            if (roleColor) embed.setColor(roleColor);
            return interaction.reply({ embeds: [embed] });
        }
    },

    async autocomplete(_client, interaction) {
        if (!interaction.guild) {
            return;
        }

        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name !== "role_string") {
            return;
        }

        const input = focusedOption.value;

        const roleNames = interaction.guild.roles.cache.map(
            (role) => role.name,
        );

        const filtered = roleNames.filter((name) =>
            name.toLowerCase().includes(input.toLowerCase()),
        );

        await interaction.respond(
            filtered.slice(0, 25).map((name) => ({
                name,
                value: name,
            })),
        );
    },
};

export default command;
