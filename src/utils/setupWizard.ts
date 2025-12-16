import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    ChannelType,
    type ChatInputCommandInteraction,
    ComponentType,
    type Message,
    StringSelectMenuBuilder,
    type StringSelectMenuInteraction,
} from "discord.js";
import { z } from "zod";

export interface SetupField {
    key: string;
    label: string;
    type: "channel" | "role" | "emoji" | "number" | "text";
    required: boolean;
    multiple?: boolean;
    default?: any;
    zodSchema: z.ZodType;
    description?: string;
}

export interface SetupSchema<T extends z.ZodObject<any>> {
    name: string;
    fields: SetupField[];
    zodSchema: T;
    onComplete: (data: z.infer<T>) => Promise<void>;
}

interface SetupState {
    currentFieldIndex: number;
    collectedData: Record<string, any>;
    multipleValues: Record<string, any[]>;
}

/**
 * Generic setup wizard using Discord Components v2
 */
export class SetupWizard<T extends z.ZodObject<any>> {
    private schema: SetupSchema<T>;
    private state: SetupState;
    private interaction: ChatInputCommandInteraction;
    private currentMessage: Message | null = null;

    constructor(
        schema: SetupSchema<T>,
        interaction: ChatInputCommandInteraction,
    ) {
        this.schema = schema;
        this.interaction = interaction;
        this.state = {
            currentFieldIndex: 0,
            collectedData: {},
            multipleValues: {},
        };
    }

    async start(): Promise<void> {
        await this.interaction.deferReply({ ephemeral: true });
        await this.showCurrentField();
    }

    private async showCurrentField(): Promise<void> {
        const field = this.schema.fields[this.state.currentFieldIndex];
        if (!field) {
            // All fields collected, validate and complete
            await this.complete();
            return;
        }

        // Apply defaults
        if (
            field.default !== undefined &&
            !this.state.collectedData[field.key]
        ) {
            this.state.collectedData[field.key] = field.default;
        }

        // Show appropriate UI based on field type
        switch (field.type) {
            case "channel":
                await this.showChannelSelect(field);
                break;
            case "role":
                await this.showRoleSelect(field);
                break;
            case "emoji":
                await this.showEmojiInput(field);
                break;
            case "number":
            case "text":
                await this.showTextInput(field);
                break;
        }
    }

    private async showChannelSelect(field: SetupField): Promise<void> {
        if (!this.interaction.guild) {
            await this.interaction.editReply(
                "This command must be run in a server.",
            );
            return;
        }

        const channels = await this.interaction.guild.channels.fetch();
        const textChannels = channels.filter(
            (ch) => ch?.type === ChannelType.GuildText,
        );

        if (textChannels.size === 0) {
            await this.interaction.editReply("No text channels found.");
            return;
        }

        const options = Array.from(textChannels.values())
            .slice(0, 25) // Discord limit
            .map((ch) => ({
                label: ch?.name || "Unknown",
                value: ch?.id || "",
                description: `Channel ID: ${ch?.id}`,
            }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`setup:${this.schema.name}:channel:${field.key}`)
            .setPlaceholder(`Select a ${field.label}`)
            .addOptions(options);

        const row =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                selectMenu,
            );

        this.currentMessage = await this.interaction.editReply({
            content: `**Step ${this.state.currentFieldIndex + 1}/${this.schema.fields.length}**: Select ${field.label}${field.description ? `\n${field.description}` : ""}`,
            components: [row],
        });

        // Wait for selection
        try {
            const selection =
                await this.currentMessage.awaitMessageComponent<ComponentType.StringSelect>(
                    {
                        filter: (i) =>
                            i.user.id === this.interaction.user.id &&
                            i.customId ===
                                `setup:${this.schema.name}:channel:${field.key}`,
                        time: 60000,
                    },
                );

            await this.handleChannelSelect(selection, field);
        } catch (error) {
            console.error("Error in showChannelSelect:", error);
            await this.interaction.editReply({
                content: "Setup timed out. Please try again.",
                components: [],
            });
        }
    }

    private async handleChannelSelect(
        interaction: StringSelectMenuInteraction,
        field: SetupField,
    ): Promise<void> {
        const channelId = interaction.values[0];

        try {
            const validated = field.zodSchema.parse(channelId);
            this.state.collectedData[field.key] = validated;
            await interaction.update({ components: [] });
            this.state.currentFieldIndex++;
            await this.showCurrentField();
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    ephemeral: true,
                });
            } else {
                console.error("Error in handleChannelSelect:", error);
            }
        }
    }

    private async showRoleSelect(field: SetupField): Promise<void> {
        if (!this.interaction.guild) {
            await this.interaction.editReply(
                "This command must be run in a server.",
            );
            return;
        }

        const roles = await this.interaction.guild.roles.fetch();
        const options = Array.from(roles.values())
            .filter((role) => role.name !== "@everyone")
            .slice(0, 25)
            .map((role) => ({
                label: role.name,
                value: role.id,
                description: `Role ID: ${role.id}`,
            }));

        if (options.length === 0) {
            await this.interaction.editReply("No roles found.");
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`setup:${this.schema.name}:role:${field.key}`)
            .setPlaceholder(
                `Select ${field.multiple ? "roles" : `a ${field.label}`}`,
            )
            .addOptions(options)
            .setMinValues(field.required ? 1 : 0)
            .setMaxValues(field.multiple ? Math.min(options.length, 25) : 1);

        const row =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                selectMenu,
            );

        // Add "Done" button for multiple selection
        const buttons: ActionRowBuilder<ButtonBuilder>[] = [];
        if (field.multiple) {
            const doneButton = new ButtonBuilder()
                .setCustomId(`setup:${this.schema.name}:role:done:${field.key}`)
                .setLabel("Done")
                .setStyle(ButtonStyle.Primary);

            buttons.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(doneButton),
            );
        }

        const currentValues =
            this.state.multipleValues[field.key]?.map((id) => {
                const role = roles.get(id);
                return role?.name || id;
            }) || [];

        this.currentMessage = await this.interaction.editReply({
            content: `**Step ${this.state.currentFieldIndex + 1}/${this.schema.fields.length}**: Select ${field.label}${field.description ? `\n${field.description}` : ""}${field.multiple && currentValues.length > 0 ? `\n\nSelected: ${currentValues.join(", ")}` : ""}`,
            components: [row, ...buttons],
        });

        // Handle interactions
        try {
            const collected = await this.currentMessage.awaitMessageComponent({
                filter: (i) =>
                    i.user.id === this.interaction.user.id &&
                    i.customId.startsWith(`setup:${this.schema.name}:role:`),
                time: 120000,
            });

            if (collected.isStringSelectMenu()) {
                await this.handleRoleSelect(collected, field);
            } else if (collected.isButton()) {
                await this.handleRoleDone(collected, field);
            }
        } catch (error) {
            console.error("Error in showRoleSelect:", error);
            await this.interaction.editReply({
                content: "Setup timed out. Please try again.",
                components: [],
            });
        }
    }

    private async handleRoleSelect(
        interaction: StringSelectMenuInteraction,
        field: SetupField,
    ): Promise<void> {
        if (field.multiple) {
            // Add to collection
            if (!this.state.multipleValues[field.key]) {
                this.state.multipleValues[field.key] = [];
            }

            // Add new selections
            for (const roleId of interaction.values) {
                if (!this.state.multipleValues[field.key]!.includes(roleId)) {
                    this.state.multipleValues[field.key]!.push(roleId);
                }
            }

            await interaction.deferUpdate();
            await this.showRoleSelect(field); // Refresh to show updated list
        } else {
            // Single selection
            const roleId = interaction.values[0];
            try {
                const validated = field.zodSchema.parse(roleId);
                this.state.collectedData[field.key] = validated;
                await interaction.update({ components: [] });
                this.state.currentFieldIndex++;
                await this.showCurrentField();
            } catch (error) {
                if (error instanceof z.ZodError) {
                    await interaction.reply({
                        content: `Validation error: ${error.errors[0]?.message}`,
                        ephemeral: true,
                    });
                } else {
                    console.error("Error in handleRoleSelect:", error);
                }
            }
        }
    }

    private async handleRoleDone(
        interaction: ButtonInteraction,
        field: SetupField,
    ): Promise<void> {
        const values = this.state.multipleValues[field.key] || [];

        if (field.required && values.length === 0) {
            await interaction.reply({
                content: "Please select at least one role.",
                ephemeral: true,
            });
            return;
        }

        // Validate all values
        try {
            const validated = z.array(field.zodSchema).parse(values);
            this.state.collectedData[field.key] = validated;
            await interaction.update({ components: [] });
            this.state.currentFieldIndex++;
            await this.showCurrentField();
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    ephemeral: true,
                });
            } else {
                console.error("Error in handleRoleDone:", error);
            }
        }
    }

    private async showEmojiInput(field: SetupField): Promise<void> {
        // For multiple emojis, show current selections and allow adding more
        if (field.multiple) {
            const currentValues = this.state.multipleValues[field.key] || [];
            const buttons: ActionRowBuilder<ButtonBuilder>[] = [];

            const doneButton = new ButtonBuilder()
                .setCustomId(
                    `setup:${this.schema.name}:emoji:done:${field.key}`,
                )
                .setLabel("Done")
                .setStyle(ButtonStyle.Primary);

            buttons.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(doneButton),
            );

            this.currentMessage = await this.interaction.editReply({
                content: `**Step ${this.state.currentFieldIndex + 1}/${this.schema.fields.length}**: Enter ${field.label}${field.description ? `\n${field.description}` : ""}${currentValues.length > 0 ? `\n\nSelected emojis: ${currentValues.join(", ")}` : ""}\n\nReply with emojis (separate multiple with commas) or click Done to continue (you have 120 seconds):`,
                components: buttons,
            });

            // Handle both message input and button click
            try {
                // Type guard: ensure channel supports awaitMessages
                if (
                    !this.interaction.channel ||
                    !("awaitMessages" in this.interaction.channel)
                ) {
                    await this.interaction.editReply({
                        content:
                            "This command must be used in a text channel that supports messages.",
                        components: [],
                    });
                    return;
                }

                const response = await Promise.race([
                    this.interaction.channel.awaitMessages({
                        filter: (m) => m.author.id === this.interaction.user.id,
                        max: 1,
                        time: 120000,
                    }),
                    this.currentMessage.awaitMessageComponent({
                        filter: (i) =>
                            i.user.id === this.interaction.user.id &&
                            i.customId ===
                                `setup:${this.schema.name}:emoji:done:${field.key}`,
                        time: 120000,
                    }),
                ]);

                if (response && "first" in response) {
                    // Message response
                    const message = response.first();
                    if (message) {
                        await this.handleEmojiInput(message.content, field);
                        await message.delete().catch(() => {});
                    }
                } else if (response && "isButton" in response) {
                    // Button click
                    await this.handleEmojiDone(
                        response as ButtonInteraction,
                        field,
                    );
                }
            } catch (error) {
                console.error("Error in showEmojiInput:", error);
                await this.interaction.editReply({
                    content: "Setup timed out. Please try again.",
                    components: [],
                });
            }
        } else {
            // Single emoji input
            await this.showTextInputMessage(field);
        }
    }

    private async showTextInput(field: SetupField): Promise<void> {
        await this.showTextInputMessage(field);
    }

    private async showTextInputMessage(field: SetupField): Promise<void> {
        const currentValue = this.state.collectedData[field.key];

        this.currentMessage = await this.interaction.editReply({
            content: `**Step ${this.state.currentFieldIndex + 1}/${this.schema.fields.length}**: Enter ${field.label}${field.description ? `\n${field.description}` : ""}${currentValue ? `\n\nCurrent value: \`${currentValue}\`` : ""}${field.default !== undefined ? `\n\nDefault: \`${field.default}\`` : ""}\n\nPlease reply with the value (you have 60 seconds):`,
            components: [],
        });

        // Wait for message
        try {
            // Type guard: ensure channel supports awaitMessages
            if (
                !this.interaction.channel ||
                !("awaitMessages" in this.interaction.channel)
            ) {
                await this.interaction.editReply({
                    content:
                        "This command must be used in a text channel that supports messages.",
                    components: [],
                });
                return;
            }

            const collected = await this.interaction.channel.awaitMessages({
                filter: (m) => m.author.id === this.interaction.user.id,
                max: 1,
                time: 60000,
            });

            const message = collected?.first();
            if (message) {
                await this.handleTextInput(message.content, field);
                await message.delete().catch(() => {});
            }
        } catch (error) {
            console.error("Error in showTextInputMessage:", error);
            await this.interaction.editReply({
                content: "Setup timed out. Please try again.",
            });
        }
    }

    private async handleTextInput(
        value: string,
        field: SetupField,
    ): Promise<void> {
        // Parse based on type
        let parsedValue: any = value;

        if (field.type === "number") {
            parsedValue = Number.parseInt(value, 10);
            if (Number.isNaN(parsedValue)) {
                await this.interaction.followUp({
                    content: "Please enter a valid number.",
                    ephemeral: true,
                });
                await this.showTextInputMessage(field);
                return;
            }
        }

        try {
            const validated = field.zodSchema.parse(parsedValue);
            this.state.collectedData[field.key] = validated;
            this.state.currentFieldIndex++;
            await this.showCurrentField();
        } catch (error) {
            if (error instanceof z.ZodError) {
                await this.interaction.followUp({
                    content: `Validation error: ${error.errors[0]?.message}\n\nPlease try again.`,
                    ephemeral: true,
                });
                await this.showTextInputMessage(field);
            }
        }
    }

    private async handleEmojiInput(
        value: string,
        field: SetupField,
    ): Promise<void> {
        // Extract emoji IDs from the input
        // Supports unicode emoji, <:name:123>, <a:name:123>, 123 (raw ID), or comma-separated
        const emojiPattern = /<a?:(\w+):(\d+)>|(\p{Emoji})|(\d{17,19})/gu;
        const matches = [...value.matchAll(emojiPattern)];

        if (matches.length === 0) {
            await this.interaction.followUp({
                content:
                    "No valid emojis found. Please enter emojis, custom emoji codes, or emoji IDs.",
                ephemeral: true,
            });
            await this.showEmojiInput(field);
            return;
        }

        // Extract emoji IDs or the emoji itself
        const emojiIds = matches.map((match) => {
            if (match[2]) return match[2]; // Custom emoji ID
            if (match[3]) return match[3]; // Unicode emoji
            if (match[4]) return match[4]; // Raw ID
            return match[0]; // Fallback to full match
        });

        if (field.multiple) {
            // Add to collection
            if (!this.state.multipleValues[field.key]) {
                this.state.multipleValues[field.key] = [];
            }

            // Add new emojis (avoid duplicates)
            for (const emojiId of emojiIds) {
                if (!this.state.multipleValues[field.key]!.includes(emojiId)) {
                    this.state.multipleValues[field.key]!.push(emojiId);
                }
            }

            // Show again to allow more input
            await this.showEmojiInput(field);
        } else {
            // Single emoji
            const emojiId = emojiIds[0];
            try {
                const validated = field.zodSchema.parse(emojiId);
                this.state.collectedData[field.key] = validated;
                this.state.currentFieldIndex++;
                await this.showCurrentField();
            } catch (error) {
                if (error instanceof z.ZodError) {
                    await this.interaction.followUp({
                        content: `Validation error: ${error.errors[0]?.message}\n\nPlease try again.`,
                        ephemeral: true,
                    });
                    await this.showEmojiInput(field);
                } else {
                    console.error("Error in handleEmojiInput:", error);
                }
            }
        }
    }

    private async handleEmojiDone(
        interaction: ButtonInteraction,
        field: SetupField,
    ): Promise<void> {
        const values = this.state.multipleValues[field.key] || [];

        if (field.required && values.length === 0) {
            await interaction.reply({
                content: "Please enter at least one emoji.",
                ephemeral: true,
            });
            return;
        }

        // Validate all values
        try {
            const validated = z.array(field.zodSchema).parse(values);
            this.state.collectedData[field.key] = validated;
            await interaction.update({ components: [] });
            this.state.currentFieldIndex++;
            await this.showCurrentField();
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    ephemeral: true,
                });
            } else {
                console.error("Error in handleEmojiDone:", error);
            }
        }
    }

    private async complete(): Promise<void> {
        // Final validation with complete schema
        try {
            const validated = this.schema.zodSchema.parse(
                this.state.collectedData,
            );

            await this.interaction.editReply({
                content: "Saving configuration...",
                components: [],
            });

            await this.schema.onComplete(validated);

            await this.interaction.editReply({
                content: `${this.schema.name} setup completed successfully!`,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                await this.interaction.editReply({
                    content: `Validation failed:\n${error.errors.map((e) => `- ${e.path.join(".")}: ${e.message}`).join("\n")}`,
                    components: [],
                });
            } else {
                console.error("Setup completion error:", error);
                await this.interaction.editReply({
                    content: `Failed to complete setup: ${error instanceof Error ? error.message : "Unknown error"}`,
                    components: [],
                });
            }
        }
    }
}
