import {
    EmbedBuilder,
    GuildMember,
    Role,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";
import { parseAndEvaluate } from "../modules/operator-parser.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";

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
                        .setRequired(true),
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
                        .setRequired(true),
                ),
        ),
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "This command can only be used in a server.",
            });
        }

        function lookup(roleName: string): GuildMember[] {
            const result = interaction.guild!.roles.cache.find(
                (role) => role.name === roleName,
            );

            if (!result) {
                throw new Error(`Role not found: ${roleName}`);
            }

            return result.members.map(
                (member) =>
                    ({
                        id: member.id,
                        displayName: member.displayName,
                    }) as GuildMember,
            );
        }

        function equals(a: GuildMember, b: GuildMember): boolean {
            return a.id === b.id;
        }

        const roleString = interaction.options.getString("role_string", true);

        let members: GuildMember[];
        try {
            members = parseAndEvaluate<string, GuildMember>(
                roleString,
                (value) => {
                    return value;
                },
                lookup,
                equals,
            );
        } catch (error) {
            return interaction.reply({
                content: `${(error as Error).message}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.options.getSubcommand() === "members") {
            members.sort((a, b) => a.displayName.localeCompare(b.displayName));

            const embeds = [];
            let chunk = [];
            while (members.length > 0) {
                chunk.push(members.shift());
                if (chunk.length >= 20 || members.length === 0) {
                    const description = chunk
                        .map((member) => `${member.displayName}`)
                        .join("\n");

                    const embed = new EmbedBuilder()
                        .setTitle(`Members with the roles ${roleString}`)
                        .setDescription(description);
                    embeds.push(embed);
                    chunk = [];
                }
            }

            const paginator = new EmbedPaginator(embeds);
            paginator.send(interaction);
        }
    },
};

export default command;
