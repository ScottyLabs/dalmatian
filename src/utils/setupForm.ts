import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    type ChannelSelectMenuInteraction,
    ChannelType,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    type ModalSubmitInteraction,
    RoleSelectMenuBuilder,
    type RoleSelectMenuInteraction,
    SeparatorBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { z } from "zod";

export function displayEmoji(emojiId: string): string {
    // Snowflake ID, wrap in emoji syntax
    if (/^\d{17,19}$/.test(emojiId)) {
        return `<:_:${emojiId}>`;
    }

    // Otherwise return as-is (unicode emoji)
    return emojiId;
}

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
    collectedData: Record<string, any>;
}

/**
 * Generic setup form using Discord Components v2
 */
export class SetupForm<T extends z.ZodObject<any>> {
    private schema: SetupSchema<T>;
    private state: SetupState;
    private interaction: ChatInputCommandInteraction;

    constructor(
        schema: SetupSchema<T>,
        interaction: ChatInputCommandInteraction,
    ) {
        this.schema = schema;
        this.interaction = interaction;
        this.state = {
            collectedData: {},
        };

        // Apply defaults
        for (const field of this.schema.fields) {
            if (field.default !== undefined) {
                this.state.collectedData[field.key] = field.default;
            }
        }
    }

    async start(): Promise<void> {
        await this.interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.showForm();
    }

    private async showForm(): Promise<void> {
        await this.interaction.editReply({
            components: this.buildFormComponents(),
            flags: MessageFlags.IsComponentsV2,
        });

        // Listen for interactions
        await this.handleInteractions();
    }

    private buildComponentForField(
        field: SetupField,
    ): ActionRowBuilder<any> | null {
        switch (field.type) {
            case "channel":
                return this.buildChannelSelect(field);
            case "role":
                return this.buildRoleSelect(field);
            case "emoji":
            case "number":
            case "text":
                return this.buildTextInputButton(field);
            default:
                return null;
        }
    }

    private buildChannelSelect(
        field: SetupField,
    ): ActionRowBuilder<ChannelSelectMenuBuilder> {
        const select = new ChannelSelectMenuBuilder()
            .setCustomId(`setup:${this.schema.name}:channel:${field.key}`)
            .setPlaceholder(field.label)
            .setChannelTypes(ChannelType.GuildText);

        if (!field.required) {
            select.setMinValues(0);
        }

        return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            select,
        );
    }

    private buildRoleSelect(
        field: SetupField,
    ): ActionRowBuilder<RoleSelectMenuBuilder> {
        const select = new RoleSelectMenuBuilder()
            .setCustomId(`setup:${this.schema.name}:role:${field.key}`)
            .setPlaceholder(field.label);

        if (field.multiple) {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(25); // Discord limit
        } else {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(1);
        }

        return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            select,
        );
    }

    private buildTextInputButton(
        field: SetupField,
    ): ActionRowBuilder<ButtonBuilder> {
        const button = new ButtonBuilder()
            .setCustomId(`setup:${this.schema.name}:input:${field.key}`)
            .setLabel(field.label)
            .setStyle(ButtonStyle.Primary);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    }

    private buildFormComponents(): any[] {
        // Build Components v2 container
        const container = new ContainerBuilder()
            .setAccentColor(0x393a41)
            .addTextDisplayComponents((text) =>
                text.setContent(`# ${this.schema.name}`),
            );

        // Add each field with its component
        for (const field of this.schema.fields) {
            const value = this.state.collectedData[field.key];

            let fieldText = `**${field.label}**`;
            if (field.description) {
                fieldText += `\n${field.description}`;
            }
            if (field.required) {
                fieldText += "\n*Required*";
            }

            // Only show "Current:" for text input fields
            if (
                value !== undefined &&
                (field.type === "emoji" ||
                    field.type === "number" ||
                    field.type === "text")
            ) {
                if (Array.isArray(value)) {
                    if (field.type === "emoji") {
                        const displayValues = value.map(displayEmoji);
                        fieldText += `\n\nCurrent: ${displayValues.join(", ")}`;
                    } else {
                        fieldText += `\n\nCurrent: ${value.join(", ")}`;
                    }
                } else {
                    fieldText += `\n\nCurrent: \`${value}\``;
                }
            }

            container.addTextDisplayComponents((text) =>
                text.setContent(fieldText),
            );

            // Add interactive component
            const componentRow = this.buildComponentForField(field);
            if (componentRow) {
                container.addActionRowComponents(componentRow);
            }

            container.addSeparatorComponents(new SeparatorBuilder());
        }

        // Add submit button
        const submitButton = new ButtonBuilder()
            .setCustomId(`setup:${this.schema.name}:submit`)
            .setLabel("Submit")
            .setStyle(ButtonStyle.Success);

        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton),
        );

        return [container];
    }

    private async handleInteractions(): Promise<void> {
        const collector =
            this.interaction.channel?.createMessageComponentCollector({
                filter: (i) => i.user.id === this.interaction.user.id,
                time: 300000, // 5 minutes
            });

        if (!collector) {
            await this.interaction.editReply({
                content: "Error: Could not create interaction collector.",
                components: [],
            });
            return;
        }

        collector.on("collect", async (i) => {
            if (i.customId === `setup:${this.schema.name}:submit`) {
                collector.stop("submitted");
                await this.handleSubmit(i as ButtonInteraction);
            } else if (
                i.customId.startsWith(`setup:${this.schema.name}:channel:`)
            ) {
                await this.handleChannelSelect(
                    i as ChannelSelectMenuInteraction,
                );
            } else if (
                i.customId.startsWith(`setup:${this.schema.name}:role:`)
            ) {
                await this.handleRoleSelect(i as RoleSelectMenuInteraction);
            } else if (
                i.customId.startsWith(`setup:${this.schema.name}:input:`)
            ) {
                await this.handleTextInputButton(i as ButtonInteraction);
            }
        });

        collector.on("end", async (_collected, reason) => {
            if (reason === "time") {
                await this.interaction
                    .editReply({
                        content: "Setup timed out. Please try again.",
                        components: [],
                    })
                    .catch(() => {});
            }
        });
    }

    private async handleChannelSelect(
        interaction: ChannelSelectMenuInteraction,
    ): Promise<void> {
        const fieldKey = interaction.customId.split(":")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);

        if (!field) return;

        const channelId = interaction.values[0];

        try {
            const validated = field.zodSchema.parse(channelId);
            this.state.collectedData[field.key] = validated;

            await interaction.update({
                components: this.buildFormComponents(),
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.error("Error in handleChannelSelect:", error);
            }
        }
    }

    private async handleRoleSelect(
        interaction: RoleSelectMenuInteraction,
    ): Promise<void> {
        const fieldKey = interaction.customId.split(":")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);

        if (!field) return;

        try {
            if (field.multiple) {
                const validated = z
                    .array(field.zodSchema)
                    .parse(interaction.values);
                this.state.collectedData[field.key] = validated;
            } else {
                const validated = field.zodSchema.parse(interaction.values[0]);
                this.state.collectedData[field.key] = validated;
            }

            await interaction.update({
                components: this.buildFormComponents(),
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.error("Error in handleRoleSelect:", error);
            }
        }
    }

    private async handleTextInputButton(
        interaction: ButtonInteraction,
    ): Promise<void> {
        const fieldKey = interaction.customId.split(":")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);

        if (!field) return;

        // Create modal with text input
        const textInput = new TextInputBuilder({
            customId: "value",
            label: field.label,
            style:
                field.type === "number" || field.type === "emoji"
                    ? TextInputStyle.Short
                    : TextInputStyle.Paragraph,
            required: field.required,
        });

        if (field.description) {
            textInput.setPlaceholder(field.description);
        }

        if (this.state.collectedData[field.key] !== undefined) {
            const value = this.state.collectedData[field.key];
            if (Array.isArray(value)) {
                textInput.setValue(value.join(", "));
            } else {
                textInput.setValue(String(value));
            }
        }

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
            textInput,
        );

        const modal = new ModalBuilder({
            customId: `setup:${this.schema.name}:modal:${field.key}`,
            title: field.label,
            components: [row],
        });

        await interaction.showModal(modal);

        // Wait for modal submission
        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.customId ===
                    `setup:${this.schema.name}:modal:${field.key}`,
                time: 120000, // 2 minutes
            });

            await this.handleModalSubmit(modalSubmit, field);
        } catch (error) {
            console.error("Error waiting for modal submit:", error);
        }
    }

    private async handleModalSubmit(
        interaction: ModalSubmitInteraction,
        field: SetupField,
    ): Promise<void> {
        const value = interaction.fields.getTextInputValue("value");

        try {
            let parsedValue: any = value;

            if (field.type === "number") {
                parsedValue = Number.parseInt(value, 10);
                if (Number.isNaN(parsedValue)) {
                    await interaction.reply({
                        content: "Please enter a valid number.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            } else if (field.type === "emoji" && field.multiple) {
                // Parse comma-separated emoji IDs or unicode emojis
                parsedValue = value
                    .split(",")
                    .map((v: string) => v.trim())
                    .filter((v: string) => v.length > 0);

                if (parsedValue.length === 0) {
                    await interaction.reply({
                        content: "Please enter at least one emoji ID or emoji.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            }

            if (field.multiple && !Array.isArray(parsedValue)) {
                // Split by comma for multiple values
                parsedValue = parsedValue
                    .split(",")
                    .map((v: string) => v.trim())
                    .filter((v: string) => v);
            }

            const validated = field.multiple
                ? z.array(field.zodSchema).parse(parsedValue)
                : field.zodSchema.parse(parsedValue);

            this.state.collectedData[field.key] = validated;

            // Update original message after modal submit
            await interaction.deferUpdate();
            await this.interaction.editReply({
                components: this.buildFormComponents(),
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation error: ${error.errors[0]?.message}`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.error("Error in handleModalSubmit:", error);
            }
        }
    }

    private async handleSubmit(interaction: ButtonInteraction): Promise<void> {
        // Final validation with complete schema
        try {
            const validated = this.schema.zodSchema.parse(
                this.state.collectedData,
            );

            const savingContainer = new ContainerBuilder()
                .setAccentColor(0x393a41)
                .addTextDisplayComponents((text) =>
                    text.setContent(
                        `# ${this.schema.name}\n\nSaving configuration...`,
                    ),
                );

            await interaction.update({
                components: [savingContainer],
                flags: MessageFlags.IsComponentsV2,
            });

            await this.schema.onComplete(validated);

            const successContainer = new ContainerBuilder()
                .setAccentColor(0x393a41)
                .addTextDisplayComponents((text) =>
                    text.setContent(
                        `# ${this.schema.name}\n\nSetup completed successfully!`,
                    ),
                );

            await this.interaction.editReply({
                components: [successContainer],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                await interaction.reply({
                    content: `Validation failed:\n${error.errors.map((e) => `- ${e.path.join(".")}: ${e.message}`).join("\n")}`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.error("Setup completion error:", error);
                await interaction.reply({
                    content: `Failed to complete setup: ${error instanceof Error ? error.message : "Unknown error"}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    }
}
