import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
} from "discord.js";

import { DEFAULT_EMBED_COLOR } from "../constants.js";
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
    private rendNonce = 0;

    constructor(schema: SetupSchema, interaction: ChatInputCommandInteraction) {
        this.schema = schema;
        this.interaction = interaction;
        this.state = {
            collectedData: {},
        };

        for (const field of this.schema.fields) {
            if (field.default !== undefined) {
                this.state.collectedData[field.key] = field.default;
            }
        }
    }

    async start(): Promise<void> {
        await this.interaction.deferReply();
        await this.showForm();
    }

    private async showForm(): Promise<void> {
        await this.interaction.editReply({
            components: [this.buildFormContainer()],
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
            .setCustomId(`setup;${this.schema.name};string;${field.key}`)
            .setPlaceholder("Select an exam");

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

    private buildFormContainer(): ContainerBuilder {
        this.rendNonce++;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((text) =>
                text.setContent(`# ${this.schema.name}`),
            );

        for (const field of this.schema.fields) {
            let fieldText = `**${field.label}**`;
            if (field.description) fieldText += `\n${field.description}`;
            if (field.required) fieldText += "\n*Required*";

            container.addTextDisplayComponents((text) =>
                text.setContent(fieldText),
            );

            const componentRow = this.buildComponentForField(field);
            if (componentRow) container.addActionRowComponents(componentRow);

            container.addSeparatorComponents(new SeparatorBuilder());
        }

        const hasCollectedData = Object.values(this.state.collectedData).some(
            (v) => Array.isArray(v) && v.length > 0,
        );

        if (hasCollectedData) {
            container.addTextDisplayComponents((text) =>
                text.setContent("**Selected Exams**\n"),
            );
        }
        for (const key of Object.keys(this.state.collectedData)) {
            const items = this.state.collectedData[key];
            if (!Array.isArray(items)) continue;

            for (const item of items) {
                const display = item.score
                    ? `- ${item.examName} - Score: ${item.score}`
                    : `- ${item.examName} - Pending score`;
                container.addTextDisplayComponents((text) =>
                    text.setContent(display),
                );
            }
        }

        container.addSeparatorComponents(new SeparatorBuilder());

        const submitButton = new ButtonBuilder()
            .setCustomId(`setup;${this.schema.name};submit`)
            .setLabel("Submit")
            .setStyle(ButtonStyle.Success);

        const clearButton = new ButtonBuilder()
            .setCustomId(`setup;${this.schema.name};clear`)
            .setLabel("Clear Selected")
            .setStyle(ButtonStyle.Danger);

        if (hasCollectedData) {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    submitButton,
                    clearButton,
                ),
            );
        } else {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    submitButton,
                ),
            );
        }

        return container;
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
                i.customId === `setup;${this.schema.name};submit`
            ) {
                await i.deferUpdate();
                collector.stop("submitted");
                return;
            }

            if (
                i.isButton() &&
                i.customId === `setup;${this.schema.name};clear`
            ) {
                for (const key of Object.keys(this.state.collectedData)) {
                    if (Array.isArray(this.state.collectedData[key])) {
                        this.state.collectedData[key] = [];
                    }
                }

                await i.update({
                    components: [this.buildFormContainer()],
                });
            }

            if (i.customId.startsWith(`setup;${this.schema.name};score;`)) {
                await this.handleScoreSelect(i as StringSelectMenuInteraction);
            } else if (
                i.customId.startsWith(`setup;${this.schema.name};string;`)
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
        const parts = interaction.customId.split(";");

        const fieldKey = parts[3];
        const examName = parts[4];

        const field = this.schema.fields.find((f) => f.key === fieldKey);
        if (!field) return;

        const score = Number(interaction.values[0]);

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
            components: [this.buildFormContainer()],
        });
    }

    private async handleStringSelect(
        interaction: StringSelectMenuInteraction,
    ): Promise<void> {
        const fieldKey = interaction.customId.split(";")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);
        if (!field || !field.modal) return;

        const examName = interaction.values[0];
        if (!examName) return;

        const container = this.buildFormContainer();

        container.addActionRowComponents(
            this.buildScoreSelect(field, examName),
        );

        await interaction.update({
            components: [container],
        });
    }

    private buildScoreSelect(
        field: SetupField,
        examName: string,
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const scoreSelect = new StringSelectMenuBuilder()
            .setCustomId(
                `setup;${this.schema.name};score;${field.key};${examName};${this.rendNonce}`,
            )
            .setPlaceholder(`Select score for ${examName}`)
            .addOptions(
                ["1", "2", "3", "4", "5"].map((n) => ({
                    label: n,
                    value: n,
                })),
            );

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            scoreSelect,
        );
    }
}
