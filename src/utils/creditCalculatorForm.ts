import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
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
    onComplete: (data: Record<string, any>) => Promise<ContainerBuilder>;
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
        const message = await this.interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === this.interaction.user.id,
            time: 300_000,
        });

        collector.on("collect", async (i) => {
            if (
                i.isButton() &&
                i.customId === `setup:${this.schema.name}:submit`
            ) {
                await i.deferUpdate(); // acknowledge button
                collector.stop("submitted"); // triggers onComplete
                return;
            }

            if (i.customId.startsWith(`setup:${this.schema.name}:score:`)) {
                await this.handleScoreSelect(i as StringSelectMenuInteraction);
            } else if (
                i.customId.startsWith(`setup:${this.schema.name}:string:`)
            ) {
                await this.handleStringSelect(i as StringSelectMenuInteraction);
            }
        });

        collector.on("end", async (_collected, reason) => {
            if (reason === "submitted") {
                const resultContainer = await this.schema.onComplete(
                    this.state.collectedData,
                );

                await this.interaction.editReply({
                    components: [resultContainer],
                });
            }
            if (reason === "time") {
                await this.interaction.editReply({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            (text) =>
                                text.setContent(
                                    "Calculator timed out. Please try again.",
                                ),
                        ),
                    ],
                });
            }
        });
    }

    private async handleScoreSelect(
        interaction: StringSelectMenuInteraction,
    ): Promise<void> {
        const [, , , fieldKey, examName] = interaction.customId.split(":");

        const field = this.schema.fields.find((f) => f.key === fieldKey);
        if (!field) return;

        const score = Number(interaction.values[0]); // ALWAYS valid

        if (!this.state.collectedData[field.key]) {
            this.state.collectedData[field.key] = [];
        }

        const arr = this.state.collectedData[field.key];

        const existing = arr.find((e: any) => e.examName === examName);

        if (existing) {
            existing.score = score;
        } else {
            arr.push({ examName, score });
        }

        await interaction.update({
            components: this.buildFormComponents(),
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
                await this.showScoreSelect(interaction, field, value);
                return;
            }
        }
    }

    private async showScoreSelect(
        interaction: StringSelectMenuInteraction,
        field: SetupField,
        examName: string,
    ) {
        const scoreSelect = new StringSelectMenuBuilder()
            .setCustomId(
                `setup:${this.schema.name}:score:${field.key}:${examName}`,
            )
            .setPlaceholder(`Select score for ${examName}`)
            .addOptions(
                ["1", "2", "3", "4", "5"].map((n) => ({
                    label: n,
                    value: n,
                })),
            );

        const row =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                scoreSelect,
            );

        await interaction.update({
            components: [
                ...this.buildFormComponents(),
                new ContainerBuilder().addActionRowComponents(row),
            ],
        });
    }
}
