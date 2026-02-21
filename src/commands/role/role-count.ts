import {
    SlashCommandBuilder,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
} from "discord.js";
import { parseAndEvaluate } from "@/modules/operator-parser.ts";
import { lookup, equals } from "./utils.ts";
import type { SlashCommand } from "@/types.d.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("role-count")
        .setDescription("Get numbers and members of roles")
        .addStringOption((option) =>
            option
                .setName("role_string")
                .setDescription(
                    "The role(s) to get the member count of (e.g. role1 and (role2 or role3))",
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

        const embed = new EmbedBuilder()
            .setTitle(`"${roleString}"`)
            .setDescription(`${members.length} members`);

        return interaction.reply({ embeds: [embed] });
    }
};

export default command;
