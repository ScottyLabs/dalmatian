import {
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { db, redirectionInstances } from "../db/index.ts";
import type { SlashCommand } from "../types.d.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("redirect-remove")
        .setDescription("Remove a reaction redirect configuration (admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption((option) =>
            option
                .setName("id")
                .setDescription(
                    "The configuration ID to remove (from /redirect-list)",
                )
                .setRequired(true),
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({
                content: "This command must be run in a server.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const configId = interaction.options.getInteger("id", true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Verify the configuration exists and belongs to this guild
        const [instance] = await db
            .select()
            .from(redirectionInstances)
            .where(
                and(
                    eq(redirectionInstances.id, configId),
                    eq(redirectionInstances.guildId, interaction.guildId),
                ),
            )
            .limit(1);

        if (!instance) {
            await interaction.editReply({
                content: `Configuration #${configId} not found in this server.`,
            });
            return;
        }

        // Delete the configuration (cascade will remove related records)
        await db
            .delete(redirectionInstances)
            .where(eq(redirectionInstances.id, configId));

        await interaction.editReply({
            content: `Successfully removed configuration #${configId}`,
        });
    },
};

export default command;
