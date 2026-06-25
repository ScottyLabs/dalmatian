import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    type StringSelectMenuInteraction,
} from "discord.js";

import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import { AdvancedCreditType, SCORE_RANGES } from "./advancedCreditCourseUtils.ts";
import { logger, nodeError } from "./log.ts";

export const DISCORD_COMPONENT_LIMITS = {
    containerChildren: 40,
    actionRowButtons: 5,
    stringSelectOptions: 25,
    customIdLength: 100,
    buttonLabelLength: 80,
    selectOptionTextLength: 100,
    selectPlaceholderLength: 150,
    textDisplayLength: 3500,
} as const;

const SELECTED_EXAM_SUMMARY_LIMIT = 20;
const RESULT_ITEMS_PER_PAGE = 5;

export interface SetupField {
    key: string;
    label: string;
    type: "string";
    required: boolean;
    multiple?: boolean;
    default?: unknown;
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

export interface SetupResult {
    title: string;
    description?: string;
    emptyMessage: string;
    notices?: string[];
    items: string[];
    footer?: string;
}

export interface SelectedExam {
    examName: string;
    score?: number | string;
}

export interface SetupSchema {
    name: string;
    type: AdvancedCreditType;
    fields: SetupField[];
    onComplete: (data: Record<string, unknown>) => Promise<SetupResult> | SetupResult;
}

interface SetupState {
    collectedData: Record<string, unknown>;
    optionPages: Record<string, number>;
    result?: SetupResult;
    resultPage: number;
}

type ComponentJson = {
    type?: number;
    custom_id?: string;
    label?: string;
    placeholder?: string;
    content?: string;
    components?: ComponentJson[];
    options?: {
        label?: string;
        value?: string;
        description?: string;
    }[];
};

type MessageComponentBuilderLike = {
    toJSON(): ComponentJson;
};

type ScoreRequest = {
    fieldKey: string;
    examIndex: number;
};

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    if (maxLength <= 1) return value.slice(0, maxLength);
    return `${value.slice(0, maxLength - 1)}…`;
}

function validateLength(label: string, value: string | undefined, min: number, max: number): void {
    if (value === undefined) return;
    if (value.length < min || value.length > max) {
        throw new Error(`${label} length ${value.length} is outside ${min}-${max}`);
    }
}

function validateComponent(component: ComponentJson, path: string): void {
    validateLength(
        `${path}.custom_id`,
        component.custom_id,
        1,
        DISCORD_COMPONENT_LIMITS.customIdLength,
    );

    if (component.type === 1) {
        const children = component.components ?? [];
        if (children.length < 1 || children.length > DISCORD_COMPONENT_LIMITS.actionRowButtons) {
            throw new Error(`${path}.components length ${children.length} is outside 1-5`);
        }

        const selectCount = children.filter((child) => child.type !== 2).length;
        if (selectCount > 0 && children.length !== 1) {
            throw new Error(`${path}.components contains a select with other components`);
        }
    }

    if (component.type === 2) {
        validateLength(
            `${path}.label`,
            component.label,
            1,
            DISCORD_COMPONENT_LIMITS.buttonLabelLength,
        );
    }

    if (component.type === 3) {
        validateLength(
            `${path}.placeholder`,
            component.placeholder,
            0,
            DISCORD_COMPONENT_LIMITS.selectPlaceholderLength,
        );

        const options = component.options ?? [];
        if (options.length > DISCORD_COMPONENT_LIMITS.stringSelectOptions) {
            throw new Error(`${path}.options length ${options.length} exceeds 25`);
        }

        for (const [index, option] of options.entries()) {
            validateLength(
                `${path}.options[${index}].label`,
                option.label,
                1,
                DISCORD_COMPONENT_LIMITS.selectOptionTextLength,
            );
            validateLength(
                `${path}.options[${index}].value`,
                option.value,
                1,
                DISCORD_COMPONENT_LIMITS.selectOptionTextLength,
            );
            validateLength(
                `${path}.options[${index}].description`,
                option.description,
                0,
                DISCORD_COMPONENT_LIMITS.selectOptionTextLength,
            );
        }
    }

    if (component.type === 10) {
        validateLength(
            `${path}.content`,
            component.content,
            1,
            DISCORD_COMPONENT_LIMITS.textDisplayLength,
        );
    }

    for (const [index, child] of (component.components ?? []).entries()) {
        validateComponent(child, `${path}.components[${index}]`);
    }
}

export function assertDiscordSafeComponents(components: MessageComponentBuilderLike[]): void {
    for (const [index, component] of components.entries()) {
        const json = component.toJSON();

        if (json.type === 17) {
            const children = json.components ?? [];
            if (
                children.length < 1 ||
                children.length > DISCORD_COMPONENT_LIMITS.containerChildren
            ) {
                throw new Error(
                    `components[${index}].components length ${children.length} is outside 1-40`,
                );
            }
        }

        validateComponent(json, `components[${index}]`);
    }
}

function paginateBlocks(blocks: string[]): string[] {
    const pages: string[] = [];
    let currentBlocks: string[] = [];
    let currentLength = 0;

    for (const block of blocks) {
        const boundedBlock = truncate(block, DISCORD_COMPONENT_LIMITS.textDisplayLength);
        const separatorLength = currentBlocks.length === 0 ? 0 : 2;
        const nextLength = currentLength + separatorLength + boundedBlock.length;

        if (
            currentBlocks.length > 0 &&
            (currentBlocks.length >= RESULT_ITEMS_PER_PAGE ||
                nextLength > DISCORD_COMPONENT_LIMITS.textDisplayLength)
        ) {
            pages.push(currentBlocks.join("\n\n"));
            currentBlocks = [];
            currentLength = 0;
        }

        currentBlocks.push(boundedBlock);
        currentLength += (currentBlocks.length === 1 ? 0 : 2) + boundedBlock.length;
    }

    if (currentBlocks.length > 0) {
        pages.push(currentBlocks.join("\n\n"));
    }

    return pages.length > 0 ? pages : [""];
}

export function buildResultContainer(
    result: SetupResult,
    creditType: AdvancedCreditType,
    page: number,
    includeControls: boolean,
): ContainerBuilder {
    const pages = paginateBlocks(result.items);
    const boundedPage = Math.min(Math.max(page, 0), pages.length - 1);
    const container = new ContainerBuilder()
        .setAccentColor(DEFAULT_EMBED_COLOR)
        .addTextDisplayComponents((text) =>
            text.setContent(
                truncate(
                    result.description
                        ? `## ${result.title}\n${result.description}`
                        : `## ${result.title}`,
                    DISCORD_COMPONENT_LIMITS.textDisplayLength,
                ),
            ),
        );

    const notices = result.notices ?? [];
    if (notices.length > 0) {
        container.addTextDisplayComponents((text) =>
            text.setContent(truncate(notices.map((notice) => `- ${notice}`).join("\n"), 1000)),
        );
    }

    if (result.items.length === 0) {
        container.addTextDisplayComponents((text) =>
            text.setContent(
                truncate(result.emptyMessage, DISCORD_COMPONENT_LIMITS.textDisplayLength),
            ),
        );
    } else {
        container.addTextDisplayComponents((text) => text.setContent(pages[boundedPage]!));
    }

    const footerParts: string[] = [];
    if (result.footer) footerParts.push(result.footer);
    if (pages.length > 1) {
        footerParts.push(`Page ${boundedPage + 1} of ${pages.length}`);
    }

    if (footerParts.length > 0) {
        container.addTextDisplayComponents((text) =>
            text.setContent(
                truncate(footerParts.join("\n"), DISCORD_COMPONENT_LIMITS.textDisplayLength),
            ),
        );
    }

    if (includeControls && pages.length > 1) {
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`credit;${creditType};resultPrev`)
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(boundedPage === 0),
                new ButtonBuilder()
                    .setCustomId(`credit;${creditType};resultNext`)
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(boundedPage === pages.length - 1),
            ),
        );
    }

    return container;
}

export function getResultPageCount(result: SetupResult): number {
    return paginateBlocks(result.items).length;
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
            optionPages: {},
            resultPage: 0,
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
        await this.safeEditReply([this.buildFormContainer()]);
        await this.handleInteractions();
    }

    private buildComponentForField(field: SetupField) {
        switch (field.type) {
            case "string":
                return this.buildStringSelect(field);
            default:
                return null;
        }
    }

    private buildStringSelect(field: SetupField): ActionRowBuilder<StringSelectMenuBuilder> {
        const options = field.options ?? [];
        const page = this.getOptionPage(field);
        const pageStart = page * DISCORD_COMPONENT_LIMITS.stringSelectOptions;
        const pageOptions = options.slice(
            pageStart,
            pageStart + DISCORD_COMPONENT_LIMITS.stringSelectOptions,
        );
        const select = new StringSelectMenuBuilder()
            .setCustomId(`credit;${this.schema.type};string;${field.key}`)
            .setPlaceholder("Select an exam");

        if (pageOptions.length > 0) {
            select.addOptions(
                pageOptions.map((option, index) => ({
                    label: truncate(option.label, DISCORD_COMPONENT_LIMITS.selectOptionTextLength),
                    value: String(pageStart + index),
                })),
            );
        }

        if (field.multiple) {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(
                Math.min(pageOptions.length || 1, DISCORD_COMPONENT_LIMITS.stringSelectOptions),
            );
        } else {
            select.setMinValues(field.required ? 1 : 0);
            select.setMaxValues(1);
        }

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    }

    private buildOptionPager(field: SetupField): ActionRowBuilder<ButtonBuilder> | null {
        const pageCount = this.getOptionPageCount(field);
        if (pageCount <= 1) return null;

        const page = this.getOptionPage(field);
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`credit;${this.schema.type};optPrev;${field.key}`)
                .setLabel("Previous Exams")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`credit;${this.schema.type};optNext;${field.key}`)
                .setLabel("Next Exams")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === pageCount - 1),
        );
    }

    private buildFormContainer(scoreRequest?: ScoreRequest): ContainerBuilder {
        this.rendNonce++;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((text) => text.setContent(`# ${this.schema.name}`));

        for (const field of this.schema.fields) {
            let fieldText = `**${field.label}**`;
            if (field.description) fieldText += `\n${field.description}`;
            if (field.required) fieldText += "\n*Required*";

            const pageCount = this.getOptionPageCount(field);
            if (pageCount > 1) {
                fieldText += `\nPage ${this.getOptionPage(field) + 1} of ${pageCount}`;
            }

            container.addTextDisplayComponents((text) =>
                text.setContent(truncate(fieldText, DISCORD_COMPONENT_LIMITS.textDisplayLength)),
            );

            const componentRow = this.buildComponentForField(field);
            if (componentRow) container.addActionRowComponents(componentRow);

            const optionPager = this.buildOptionPager(field);
            if (optionPager) container.addActionRowComponents(optionPager);

            container.addSeparatorComponents(new SeparatorBuilder());
        }

        const selectedSummary = this.buildSelectedExamsSummary();
        if (selectedSummary) {
            container.addTextDisplayComponents((text) => text.setContent(selectedSummary));
        }

        if (scoreRequest) {
            container.addActionRowComponents(
                this.buildScoreSelect(scoreRequest.fieldKey, scoreRequest.examIndex),
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder());

        const submitButton = new ButtonBuilder()
            .setCustomId(`credit;${this.schema.type};submit`)
            .setLabel("Submit")
            .setStyle(ButtonStyle.Success);

        const hasCollectedData = this.hasCollectedData();
        if (hasCollectedData) {
            const clearButton = new ButtonBuilder()
                .setCustomId(`credit;${this.schema.type};clear`)
                .setLabel("Clear Selected")
                .setStyle(ButtonStyle.Danger);

            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton, clearButton),
            );
        } else {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton),
            );
        }

        assertDiscordSafeComponents([container]);
        return container;
    }

    private hasCollectedData(): boolean {
        return Object.values(this.state.collectedData).some(
            (v) => Array.isArray(v) && v.length > 0,
        );
    }

    private buildSelectedExamsSummary(): string | null {
        const selected: string[] = [];

        for (const key of Object.keys(this.state.collectedData)) {
            const items = this.getCollectedItems(key);
            if (items.length === 0) continue;

            for (const item of items) {
                selected.push(
                    item.score
                        ? `- ${item.examName} - Score: ${item.score}`
                        : `- ${item.examName} - Pending score`,
                );
            }
        }

        if (selected.length === 0) return null;

        const visible = selected.slice(0, SELECTED_EXAM_SUMMARY_LIMIT);
        const hiddenCount = selected.length - visible.length;
        if (hiddenCount > 0) {
            visible.push(`- + ${hiddenCount} more selected`);
        }

        return truncate(
            ["**Selected Exams**", ...visible].join("\n"),
            DISCORD_COMPONENT_LIMITS.textDisplayLength,
        );
    }

    private async handleInteractions(): Promise<void> {
        const message = await this.interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === this.interaction.user.id,
            time: 300_000,
        });

        collector.on("collect", (i) => {
            void this.handleCollectedInteraction(
                i as ButtonInteraction | StringSelectMenuInteraction,
            ).catch(async (error) => {
                logger.error("Credit calculator interaction error:", nodeError(error));
                await this.safeEditReply([this.buildErrorContainer()]);
            });
        });

        collector.on("end", (_collected, reason) => {
            void this.handleCollectorEnd(reason).catch((error) => {
                logger.error("Credit calculator collector end error:", nodeError(error));
            });
        });
    }

    private async handleCollectedInteraction(
        i: ButtonInteraction | StringSelectMenuInteraction,
    ): Promise<void> {
        if (i.isButton() && i.customId === `credit;${this.schema.type};submit`) {
            await i.deferUpdate();
            await this.handleSubmit();
            return;
        }

        if (i.isButton() && i.customId === `credit;${this.schema.type};clear`) {
            for (const key of Object.keys(this.state.collectedData)) {
                if (Array.isArray(this.state.collectedData[key])) {
                    this.state.collectedData[key] = [];
                }
            }

            this.state.result = undefined;
            this.state.resultPage = 0;
            await this.safeUpdate(i, [this.buildFormContainer()]);
            return;
        }

        if (i.isButton() && i.customId === `credit;${this.schema.type};resultPrev`) {
            if (!this.state.result) return;
            this.state.resultPage = Math.max(0, this.state.resultPage - 1);
            await this.safeUpdate(i, [
                buildResultContainer(
                    this.state.result,
                    this.schema.type,
                    this.state.resultPage,
                    true,
                ),
            ]);
            return;
        }

        if (i.isButton() && i.customId === `credit;${this.schema.type};resultNext`) {
            if (!this.state.result) return;
            const pageCount = getResultPageCount(this.state.result);
            this.state.resultPage = Math.min(pageCount - 1, this.state.resultPage + 1);
            await this.safeUpdate(i, [
                buildResultContainer(
                    this.state.result,
                    this.schema.type,
                    this.state.resultPage,
                    true,
                ),
            ]);
            return;
        }

        if (i.isButton() && i.customId.startsWith(`credit;${this.schema.type};opt`)) {
            await this.handleOptionPageButton(i);
            return;
        }

        if (i.customId.startsWith(`credit;${this.schema.type};score;`)) {
            await this.handleScoreSelect(i as StringSelectMenuInteraction);
            return;
        }

        if (i.customId.startsWith(`credit;${this.schema.type};string;`)) {
            await this.handleStringSelect(i as StringSelectMenuInteraction);
        }
    }

    private async handleCollectorEnd(reason: string): Promise<void> {
        if (reason !== "time") return;

        if (this.state.result) {
            await this.safeEditReply([
                buildResultContainer(
                    this.state.result,
                    this.schema.type,
                    this.state.resultPage,
                    false,
                ),
            ]);
            return;
        }

        await this.safeEditReply([
            new ContainerBuilder().addTextDisplayComponents((text) =>
                text.setContent("Calculator timed out. Please try again."),
            ),
        ]);
    }

    private async handleOptionPageButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split(";");
        const direction = parts[2];
        const fieldKey = parts[3];
        if (!fieldKey) return;

        const field = this.schema.fields.find((f) => f.key === fieldKey);
        if (!field) return;

        const pageCount = this.getOptionPageCount(field);
        const currentPage = this.getOptionPage(field);
        const nextPage =
            direction === "optPrev"
                ? Math.max(0, currentPage - 1)
                : Math.min(pageCount - 1, currentPage + 1);

        this.state.optionPages[field.key] = nextPage;
        await this.safeUpdate(interaction, [this.buildFormContainer()]);
    }

    private async handleSubmit(): Promise<void> {
        this.state.result = await this.schema.onComplete(this.state.collectedData);
        this.state.resultPage = 0;
        await this.safeEditReply([
            buildResultContainer(this.state.result, this.schema.type, this.state.resultPage, true),
        ]);
    }

    private async handleScoreSelect(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split(";");

        const fieldKey = parts[3];
        const examIndex = Number(parts[4]);
        if (!fieldKey || !Number.isInteger(examIndex)) return;

        const field = this.schema.fields.find((f) => f.key === fieldKey);
        const examName = field?.options?.[examIndex]?.value;
        if (!field || !examName) return;

        const raw = interaction.values[0];
        const parsedScore = SCORE_RANGES[this.schema.type].options ? raw : Number(raw);

        const arr = this.getCollectedItems(field.key);
        if (!Array.isArray(this.state.collectedData[field.key])) {
            this.state.collectedData[field.key] = arr;
        }

        const existing = arr.find((e) => e.examName === examName);
        if (existing) {
            existing.score = parsedScore;
        } else {
            arr.push({ examName, score: parsedScore });
        }

        await this.safeUpdate(interaction, [this.buildFormContainer()]);
    }

    private async handleStringSelect(interaction: StringSelectMenuInteraction): Promise<void> {
        const fieldKey = interaction.customId.split(";")[3];
        const field = this.schema.fields.find((f) => f.key === fieldKey);
        if (!field || !field.modal) return;

        const examIndex = Number(interaction.values[0]);
        if (!Number.isInteger(examIndex) || !field.options?.[examIndex]) return;

        await this.safeUpdate(interaction, [
            this.buildFormContainer({ fieldKey: field.key, examIndex }),
        ]);
    }

    private buildScoreSelect(
        fieldKey: string,
        examIndex: number,
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const field = this.schema.fields.find((f) => f.key === fieldKey);
        const examName = field?.options?.[examIndex]?.value ?? "exam";
        const scoreSelect = new StringSelectMenuBuilder()
            .setCustomId(
                `credit;${this.schema.type};score;${fieldKey};${examIndex};${this.rendNonce}`,
            )
            .setPlaceholder(
                truncate(
                    `Select score for ${examName}`,
                    DISCORD_COMPONENT_LIMITS.selectPlaceholderLength,
                ),
            );
        const range = SCORE_RANGES[this.schema.type];
        const scoreOptions = range.options
            ? range.options.map((o) => ({ label: o, value: o }))
            : Array.from({ length: range.max! - range.min! + 1 }, (_, i) => i + range.min!).map(
                  (n) => ({ label: n.toString(), value: n.toString() }),
              );

        scoreSelect.addOptions(scoreOptions);

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(scoreSelect);
    }

    private getOptionPage(field: SetupField): number {
        const pageCount = this.getOptionPageCount(field);
        return Math.min(Math.max(this.state.optionPages[field.key] ?? 0, 0), pageCount - 1);
    }

    private getOptionPageCount(field: SetupField): number {
        return Math.max(
            1,
            Math.ceil((field.options?.length ?? 0) / DISCORD_COMPONENT_LIMITS.stringSelectOptions),
        );
    }

    private getCollectedItems(key: string): SelectedExam[] {
        const value = this.state.collectedData[key];
        return Array.isArray(value) ? (value as SelectedExam[]) : [];
    }

    private buildErrorContainer(): ContainerBuilder {
        return new ContainerBuilder().addTextDisplayComponents((text) =>
            text.setContent(
                "Something went wrong while updating the calculator. Please try again.",
            ),
        );
    }

    private async safeUpdate(
        interaction: ButtonInteraction | StringSelectMenuInteraction,
        components: ContainerBuilder[],
    ): Promise<void> {
        try {
            assertDiscordSafeComponents(components);
            await interaction.update({
                components,
            });
        } catch (error) {
            logger.error("Credit calculator update failed:", nodeError(error));
            await interaction
                .reply({
                    content: "Could not update the calculator. Please try again.",
                    flags: MessageFlags.Ephemeral,
                })
                .catch((replyError) => {
                    logger.error("Credit calculator fallback reply failed:", nodeError(replyError));
                });
        }
    }

    private async safeEditReply(components: ContainerBuilder[]): Promise<void> {
        try {
            assertDiscordSafeComponents(components);
            await this.interaction.editReply({
                components,
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            logger.error("Credit calculator editReply failed:", nodeError(error));
            const fallback = [this.buildErrorContainer()];
            assertDiscordSafeComponents(fallback);
            await this.interaction
                .editReply({
                    components: fallback,
                    flags: MessageFlags.IsComponentsV2,
                })
                .catch((fallbackError) => {
                    logger.error(
                        "Credit calculator fallback editReply failed:",
                        nodeError(fallbackError),
                    );
                });
        }
    }
}
