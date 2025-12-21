import { SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../types.d.ts";

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
                            "The role(s) to get the member count of (e.g. role1 and (role2 or role3)",
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
                            "The role(s) to get the members of (e.g. role1 and (role2 or role3)",
                        )
                        .setRequired(true),
                ),
        ),
    async execute(interaction) {
        return interaction.reply({
            content: "This command is not yet implemented. :D",
        });
    },
};

export default command;
