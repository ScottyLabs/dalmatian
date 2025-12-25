import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";

export interface SetupField {
    key: string;
    label: string;
    type: "string";
    required: boolean;
    multiple?: boolean;
    default?: any;
    description?: string;
    options?: {
        label: string;
        value: string;
    }[];
    modal?: {
        title: string;
        input: {
            key: string;
            label: string;
            min?: number;
            max?: number;
        };
    };
}

export interface SetupSchema {
    name: string;
    fields: SetupField[];
    onComplete: (data: Record<string, any>) => Promise<void>;
}

interface SetupState {
    collectedData: Record<string, any>;
}

export class SetupForm {
    private schema: SetupSchema;
    private state: SetupState;
    private interaction: ChatInputCommandInteraction;

    constructor(schema: SetupSchema, interaction: ChatInputCommandInteraction) {
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
            case "string":
                return this.buildStringSelect(field);
            default:
                return null;
        }
    }

    private buildStringSelect(
        field: SetupField,
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`setup:${this.schema.name}:string:${field.key}`)
            .setPlaceholder(field.label);

        if (field.options) {
            select.addOptions(field.options);
        }

        if (field.multiple) {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(Math.min(field.options?.length ?? 1, 25));
        } else {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(1);
        }

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            select,
        );
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
            let fieldText = `**${field.label}**`;
            if (field.description) {
                fieldText += `\n${field.description}`;
            }
            if (field.required) {
                fieldText += "\n*Required*";
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
            if (i.customId.startsWith(`setup:${this.schema.name}:string:`)) {
                await this.handleStringSelect(i as StringSelectMenuInteraction);
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

    private async handleStringSelect(
        interaction: StringSelectMenuInteraction,
    ): Promise<void> {
        const fieldKey = interaction.customId.split(":")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);

        if (!field) return;
        const selected = interaction.values;
        if (!this.state.collectedData[field.key]) {
            this.state.collectedData[field.key] = [];
        }

        for (const value of selected) {
            if (field.modal) {
                await this.showScoreModal(interaction, field, value);
            }
        }

        await interaction.update({
            components: this.buildFormComponents(),
        });
    }

    private async showScoreModal(
        interaction: StringSelectMenuInteraction,
        field: SetupField,
        examName: string,
    ) {
        const input = new TextInputBuilder({
            customId: "score",
            label: "Score (1-5)",
            style: TextInputStyle.Short,
            required: true,
        });

        const modal = new ModalBuilder({
            customId: `setup:${this.schema.name}:modal:${field.key}:${examName}`,
            title: `Enter score for ${examName}`,
            components: [
                new ActionRowBuilder<TextInputBuilder>().addComponents(input),
            ],
        });

        await interaction.showModal(modal);

        const submit = await interaction.awaitModalSubmit({
            filter: (i) =>
                i.customId ===
                `setup:${this.schema.name}:modal:${field.key}:${examName}`,
            time: 120_000,
        });

        const score = Number(submit.fields.getTextInputValue("score"));

        const arr = this.state.collectedData[field.key];

        const existing = arr.find((e: any) => e.examName === examName);
        if (existing) {
            existing.score = score;
        } else {
            arr.push({ examName, score });
        }

        await submit.deferUpdate();

        await this.interaction.editReply({
            components: this.buildFormComponents(),
        });
    }
}
