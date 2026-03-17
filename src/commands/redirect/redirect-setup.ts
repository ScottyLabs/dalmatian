import {
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import {
    db,
    emojiTriggers,
    immuneRoles,
    redirectionInstances,
} from "@/db/index.ts";
import type { SlashCommand } from "@/types.js";
import { SetupForm, type SetupSchema } from "@/utils/setupForm.ts";

// Zod schema for the complete setup
const redirectSetupSchema = z.object({
    redirectChannelId: z.string().min(1, "Redirect channel ID is required"),
    emojiIds: z
        .array(z.string().min(1, "Emoji ID cannot be empty"))
        .min(1, "At least one emoji trigger is required"),
    immuneRoleIds: z.array(z.string().min(1, "Role ID cannot be empty")),
    cooldownSeconds: z
        .number()
        .int("Cooldown must be an integer")
        .positive("Cooldown must be positive")
        .default(30),
});

type RedirectSetupData = z.infer<typeof redirectSetupSchema>;

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("redirect-setup")
        .setDescription(
            "Configure reaction redirect for a channel (admin only)",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        // Define setup schema using the generic setup wizard
        const setupSchema: SetupSchema<typeof redirectSetupSchema> = {
            name: "Reaction Redirect",
            zodSchema: redirectSetupSchema,
            fields: [
                {
                    key: "redirectChannelId",
                    label: "Redirect Channel",
                    type: "channel",
                    required: true,
                    zodSchema: z
                        .string()
                        .min(1, "Redirect channel ID is required"),
                    description:
                        "Select the channel where redirect messages will be sent",
                },
                {
                    key: "immuneRoleIds",
                    label: "Immune Roles",
                    type: "role",
                    required: false,
                    multiple: true,
                    zodSchema: z.string().min(1, "Role ID cannot be empty"),
                    description:
                        "Select role(s) whose members won't be redirected when reacted to",
                },
                {
                    key: "emojiIds",
                    label: "Emoji Triggers",
                    type: "emoji",
                    required: true,
                    multiple: true,
                    zodSchema: z.string().min(1, "Emoji ID cannot be empty"),
                    description: "Paste emojis or IDs, comma-separated",
                },
                {
                    key: "cooldownSeconds",
                    label: "Cooldown (seconds)",
                    type: "number",
                    required: false,
                    default: 30,
                    zodSchema: z
                        .number()
                        .int("Cooldown must be an integer")
                        .positive("Cooldown must be positive"),
                    description:
                        "How long (in seconds) before the same user can be pinged again",
                },
            ],
            onComplete: async (data: RedirectSetupData) => {
                if (!interaction.guildId) {
                    throw new Error("This command must be run in a server.");
                }

                // Insert redirection instance
                const [instance] = await db
                    .insert(redirectionInstances)
                    .values({
                        guildId: interaction.guildId,
                        redirectChannelId: data.redirectChannelId,
                        cooldownSeconds: data.cooldownSeconds,
                    })
                    .returning();

                if (!instance) {
                    throw new Error("Failed to create redirection instance");
                }

                // Insert emoji triggers
                if (data.emojiIds.length > 0) {
                    await db.insert(emojiTriggers).values(
                        data.emojiIds.map((emojiId) => ({
                            redirectionInstanceId: instance.id,
                            emojiId,
                        })),
                    );
                }

                // Insert immune roles
                if (data.immuneRoleIds.length > 0) {
                    await db.insert(immuneRoles).values(
                        data.immuneRoleIds.map((roleId) => ({
                            redirectionInstanceId: instance.id,
                            roleId,
                        })),
                    );
                }
            },
        };

        // Start the setup form
        const form = new SetupForm(setupSchema, interaction);
        await form.start();
    },
};

export default command;
