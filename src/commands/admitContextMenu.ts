import {
    ApplicationCommandType,
    ContextMenuCommandBuilder,
    GuildMember,
    InteractionContextType,
    MessageFlags,
    UserContextMenuCommandInteraction,
} from "discord.js";

import type { UserContextCommand } from "../types.js";

const command: UserContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName("Admit Incoming Student")
        .setType(ApplicationCommandType.User)
        .setContexts(InteractionContextType.Guild),

    async execute(interaction: UserContextMenuCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply({
                content: "This command can only be used in a server.",
            });
            return;
        }

        let member: GuildMember;
        try {
            member = await guild.members.fetch(interaction.targetUser.id);
        } catch {
            await interaction.editReply({
                content: "Member not found in this server.",
            });
            return;
        }

        try {
            const oldRole = guild.roles.cache.find(
                (r) => r.name === "Unverified",
            );
            const newRole = guild.roles.cache.find(
                (r) => r.name === "Admitted",
            );

            if (!oldRole || !newRole) {
                await interaction.editReply({
                    content: "Could not find one of the roles in the server.",
                });
                return;
            }

            if (member.roles.cache.has(oldRole.id)) {
                await member.roles.remove(oldRole.id);
            }

            if (!member.roles.cache.has(newRole.id)) {
                await member.roles.add(newRole.id);
            }

            await interaction.editReply({
                content: `Updated roles for ${member.user.tag}.`,
            });
        } catch (error) {
            console.error("Error updating roles:", error);
            await interaction.editReply({
                content: "Failed to update roles.",
            });
        }
    },
};

export default command;
