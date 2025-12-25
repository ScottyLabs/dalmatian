import {
    type ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { eq } from "drizzle-orm";
import {
    db,
    emojiTriggers,
    immuneRoles,
    redirectionInstances,
} from "../db/index.ts";
import type { SlashCommand } from "../types.d.ts";
import { displayEmoji } from "../utils/setupForm.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("redirect-list")
        .setDescription(
            "List all reaction redirect configurations (admin only)",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({
                content: "This command must be run in a server.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Get all redirection instances for this guild
        const instances = await db
            .select()
            .from(redirectionInstances)
            .where(eq(redirectionInstances.guildId, interaction.guildId));

        if (instances.length === 0) {
            await interaction.editReply({
                content:
                    "No reaction redirect configurations found for this server.",
            });
            return;
        }

        // Build embed with all configurations
        const embed = new EmbedBuilder()
            .setTitle("Reaction Redirect Configurations")
            .setDescription(`Found ${instances.length} configuration(s)`);

        for (const instance of instances) {
            // Get immune roles
            const immune = await db
                .select()
                .from(immuneRoles)
                .where(eq(immuneRoles.redirectionInstanceId, instance.id));

            // Get emoji triggers
            const triggers = await db
                .select()
                .from(emojiTriggers)
                .where(eq(emojiTriggers.redirectionInstanceId, instance.id));

            const rolesList =
                immune.length > 0
                    ? immune.map((r) => `<@&${r.roleId}>`).join(", ")
                    : "None";
            const emojiList =
                triggers.length > 0
                    ? triggers.map((t) => displayEmoji(t.emojiId)).join(", ")
                    : "None";

            embed.addFields({
                name: `Configuration #${instance.id}`,
                value:
                    `**Redirect Channel:** <#${instance.redirectChannelId}>\n` +
                    `**Immune Roles:** ${rolesList}\n` +
                    `**Emoji Triggers:** ${emojiList}\n` +
                    `**Cooldown:** ${instance.cooldownSeconds}s`,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

export default command;
