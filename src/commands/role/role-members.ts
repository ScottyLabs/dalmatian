import {
    bold,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "@/types.d.ts";
import { parseAndEvaluate } from "@/modules/operator-parser.ts";
import { EmbedPaginator } from "@/utils/EmbedPaginator.ts";
import { lookup, equals } from "./utils.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("role-members")
        .setDescription("Get count and members of roles")
        .addStringOption((option) =>
            option
                .setName("role_string")
                .setDescription(
                    "The role(s) to get the members of (e.g. role1 and (role2 or role3))",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "This command can only be used in a server.",
            });
        }

        const roleString = interaction.options.getString("role_string", true);

        let members: GuildMember[];
        try {
            members = parseAndEvaluate<string, GuildMember>(
                roleString,
                (value) => {
                    return value;
                },
                (roleName) => lookup(interaction, roleName),
                equals,
            );
        } catch (error) {
            return interaction.reply({
                content: `${(error as Error).message}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        members.sort((a, b) => a.displayName.localeCompare(b.displayName));

        const membersCount = members.length;

        const embeds = [];
        let chunk = [];
        while (members.length > 0) {
            chunk.push(members.shift());
            if (chunk.length >= 20 || members.length === 0) {
                const description = `${membersCount} members\n` + chunk
                    .map(
                        (member) =>
                            `${bold(member!.displayName)} (${member!.user.username})`,
                    )
                    .join("\n");

                const embed = new EmbedBuilder()
                    .setTitle(`"${roleString}"`)
                    .setDescription(description);
                embeds.push(embed);
                chunk = [];
            }
        }

        if (embeds.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`"${roleString}"`)
                .setDescription(`No members found.`);
            embeds.push(embed);
        }

        const paginator = new EmbedPaginator(embeds);
        return paginator.send(interaction);
    },
};

export default command;
