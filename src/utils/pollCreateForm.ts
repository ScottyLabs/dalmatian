import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    RoleSelectMenuBuilder,
    type RoleSelectMenuInteraction,
    SeparatorBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { eq } from "drizzle-orm";
import { db, type OptionMarkerStyle, pollOptions, pollRoles, polls } from "../db/index.ts";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import {
    buildPollContainer,
    buildVoteRows,
    optionMarkerEmoji,
    optionMarkerText,
    resolveRoleNames,
    schedulePollExpiry,
} from "./pollVotes.ts";

const MAX_OPTIONS = 20;
const MAX_OPTION_LENGTH = 100;
const MAX_QUESTION_LENGTH = 256;
const MAX_DURATION_MS = 4 * 7 * 24 * 60 * 60 * 1000; // 4 weeks
const BUTTON_LABEL_MAX = 80;
const OPTIONS_PER_ROW = 5;

const DURATION_MULTIPLIERS: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
};

function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([mhdw])$/);
    if (!match?.[1] || !match[2]) return null;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    const multiplier = DURATION_MULTIPLIERS[match[2]];
    if (!multiplier) return null;
    const ms = value * multiplier;
    if (!Number.isFinite(ms) || ms > MAX_DURATION_MS) return null;
    return ms;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function truncateButtonLabel(label: string): string {
    if (label.length <= BUTTON_LABEL_MAX) return label;
    return `${label.slice(0, BUTTON_LABEL_MAX - 1)}…`;
}

interface PollFormState {
    view: "main" | "options";
    question: string | null;
    options: string[];
    duration: string | null;
    anonymous: boolean;
    multiSelect: boolean;
    rankedChoice: boolean;
    whitelistRoleIds: string[];
    blacklistRoleIds: string[];
}

/** Only one /poll create session may be active per user per guild; starting a new one cancels the old. */
const activeSessions = new Map<string, PollCreateForm>();

function sessionKey(interaction: ChatInputCommandInteraction): string {
    return `${interaction.guildId}:${interaction.user.id}`;
}

export class PollCreateForm {
    private state: PollFormState = {
        view: "main",
        question: null,
        options: [],
        duration: null,
        anonymous: false,
        multiSelect: false,
        rankedChoice: false,
        whitelistRoleIds: [],
        blacklistRoleIds: [],
    };

    private modalNonce = 0;
    private collector?: any;
    private readonly key: string;

    constructor(
        private interaction: ChatInputCommandInteraction,
        private pollChannelId: string,
        private showProgressBars: boolean,
        private markerStyle: OptionMarkerStyle,
    ) {
        this.key = sessionKey(interaction);
    }

    async start() {
        const existing = activeSessions.get(this.key);
        activeSessions.set(this.key, this);
        if (existing && existing !== this) await existing.cancel();

        await this.interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.render();
        await this.listen();
    }

    /** Stops this session's collector and lets the user know it was superseded by a newer one. */
    private async cancel() {
        this.collector?.stop("superseded");
        await this.interaction
            .editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents((t) =>
                        t.setContent(
                            "This poll creation was cancelled because you started a new one.",
                        ),
                    ),
                ],
            })
            .catch(() => {});
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    private async render() {
        await this.interaction.editReply({
            components: [this.buildContainer()],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    private buildContainer(): ContainerBuilder {
        return this.state.view === "options" ? this.buildOptionsView() : this.buildMainView();
    }

    private buildMainView(): ContainerBuilder {
        const {
            question,
            options,
            duration,
            anonymous,
            multiSelect,
            rankedChoice,
            whitelistRoleIds,
            blacklistRoleIds,
        } = this.state;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((t) => t.setContent("# Create Poll"));

        // ── Question ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const questionText = question
            ? `**Question**\n> ${question}`
            : "**Question** *\\*required*";
        container.addTextDisplayComponents((t) => t.setContent(questionText));
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:question")
                    .setLabel(question ? "Edit question" : "Set question")
                    .setStyle(ButtonStyle.Primary),
            ),
        );

        // ── Options ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const optionsLines = options.length
            ? options.map((o, i) => `${optionMarkerText(i, this.markerStyle)} ${o}`).join("\n")
            : "*No options yet*";
        const optionsHeader = `**Options** (${options.length}/${MAX_OPTIONS}) ${options.length < 2 ? "*\\*min 2 required*" : ""}`;
        container.addTextDisplayComponents((t) =>
            t.setContent(`${optionsHeader}\n${optionsLines}`),
        );
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:options:edit")
                    .setLabel(options.length > 0 ? "Edit options" : "Add options")
                    .setStyle(ButtonStyle.Secondary),
            ),
        );

        // ── Duration ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const durationText = duration
            ? `**Duration**\n> ${duration}`
            : "**Duration** *(optional - e.g. 30m, 2h, 5d, 1w, max 4w)*";
        container.addTextDisplayComponents((t) => t.setContent(durationText));
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:duration")
                    .setLabel(duration ? "Edit duration" : "Set duration")
                    .setStyle(ButtonStyle.Secondary),
                ...(duration
                    ? [
                          new ButtonBuilder()
                              .setCustomId("poll:create:clear_duration")
                              .setLabel("No expiry")
                              .setStyle(ButtonStyle.Danger),
                      ]
                    : []),
            ),
        );

        // ── Settings ──
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents((t) => t.setContent("**Settings**"));
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:toggle:anonymous")
                    .setLabel("Anonymous")
                    .setStyle(anonymous ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("poll:create:toggle:multi_select")
                    .setLabel("Multi-select")
                    .setStyle(multiSelect ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("poll:create:toggle:ranked_choice")
                    .setLabel("Ranked choice")
                    .setStyle(rankedChoice ? ButtonStyle.Success : ButtonStyle.Secondary),
            ),
        );

        // ── Role restrictions ──
        container.addSeparatorComponents(new SeparatorBuilder());

        const conflictNote =
            whitelistRoleIds.length > 0 && blacklistRoleIds.length > 0
                ? "\n⚠️ *Cannot use both whitelist and blacklist - clear one before creating*"
                : "";

        const whitelistLabel =
            whitelistRoleIds.length > 0
                ? `**Voter whitelist** (${whitelistRoleIds.length} role${whitelistRoleIds.length !== 1 ? "s" : ""} - must have any)\n${whitelistRoleIds.map((id) => `<@&${id}>`).join("  ")}`
                : "**Voter whitelist** *(optional - only these roles can vote)*";
        container.addTextDisplayComponents((t) => t.setContent(whitelistLabel));
        container.addActionRowComponents(
            new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId("poll:create:whitelist")
                    .setPlaceholder("Select allowed roles…")
                    .setMinValues(0)
                    .setMaxValues(10),
            ),
        );

        const blacklistLabel =
            blacklistRoleIds.length > 0
                ? `**Voter blacklist** (${blacklistRoleIds.length} role${blacklistRoleIds.length !== 1 ? "s" : ""} - must not have any)\n${blacklistRoleIds.map((id) => `<@&${id}>`).join("  ")}`
                : "**Voter blacklist** *(optional - these roles cannot vote)*";
        container.addTextDisplayComponents((t) => t.setContent(blacklistLabel + conflictNote));
        container.addActionRowComponents(
            new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId("poll:create:blacklist")
                    .setPlaceholder("Select blocked roles…")
                    .setMinValues(0)
                    .setMaxValues(10),
            ),
        );

        // ── Submit ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const canSubmit =
            !!question &&
            options.length >= 2 &&
            !(whitelistRoleIds.length > 0 && blacklistRoleIds.length > 0);

        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:submit")
                    .setLabel("Create poll")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!canSubmit),
            ),
        );

        return container;
    }

    /** Dedicated sub-view where each option gets its own remove button (kept separate from the main view to stay under Discord's 40-component cap). */
    private buildOptionsView(): ContainerBuilder {
        const { options } = this.state;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((t) => t.setContent("# Create Poll - Options"));

        container.addSeparatorComponents(new SeparatorBuilder());
        const header = `**Options** (${options.length}/${MAX_OPTIONS})${options.length < 2 ? " *\\*min 2 required*" : ""}\nTap an option to remove it.`;
        container.addTextDisplayComponents((t) => t.setContent(header));

        if (options.length > 0) {
            chunk(options, OPTIONS_PER_ROW).forEach((row, rowIndex) => {
                const startIndex = rowIndex * OPTIONS_PER_ROW;
                container.addActionRowComponents(
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        row.map((label, i) => {
                            const index = startIndex + i;
                            const emoji = optionMarkerEmoji(index, this.markerStyle);
                            const marker = optionMarkerText(index, this.markerStyle);
                            const button = new ButtonBuilder()
                                .setCustomId(`poll:create:option:remove:${index}`)
                                .setLabel(truncateButtonLabel(emoji ? label : `${marker} ${label}`))
                                .setStyle(ButtonStyle.Danger);
                            return emoji ? button.setEmoji(emoji) : button;
                        }),
                    ),
                );
            });
        } else {
            container.addTextDisplayComponents((t) => t.setContent("*No options yet*"));
        }

        container.addSeparatorComponents(new SeparatorBuilder());
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("poll:create:add_option")
                    .setLabel("+ Add option")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(options.length >= MAX_OPTIONS),
                new ButtonBuilder()
                    .setCustomId("poll:create:options:done")
                    .setLabel("Done")
                    .setStyle(ButtonStyle.Primary),
            ),
        );

        return container;
    }

    // ─── Listener ──────────────────────────────────────────────────────────────

    private async listen() {
        // Scoped to this reply message, not the whole channel, so concurrent sessions can't cross-talk.
        const message = await this.interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === this.interaction.user.id,
            time: 10 * 60 * 1000, // 10 minutes
        });
        this.collector = collector;

        collector.on("collect", async (i) => {
            try {
                if (i.isButton()) await this.handleButton(i as ButtonInteraction, collector);
                else if (i.isRoleSelectMenu())
                    await this.handleRoleSelect(i as RoleSelectMenuInteraction);
            } catch (err) {
                console.error("PollCreateForm error:", err);
            }
        });

        collector.on("end", async (_c, reason) => {
            if (activeSessions.get(this.key) === this) activeSessions.delete(this.key);

            if (reason !== "submitted" && reason !== "superseded") {
                await this.interaction
                    .editReply({
                        components: [
                            new ContainerBuilder().addTextDisplayComponents((t) =>
                                t.setContent("Poll creation timed out."),
                            ),
                        ],
                    })
                    .catch(() => {});
            }
        });
    }

    private async handleButton(i: ButtonInteraction, collector: any) {
        const id = i.customId;

        if (id === "poll:create:question") {
            await this.showModal(
                i,
                "question",
                "Poll question",
                "What do you want to ask?",
                TextInputStyle.Short,
                MAX_QUESTION_LENGTH,
            );
            return;
        }

        if (id === "poll:create:options:edit") {
            this.state.view = "options";
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:options:done") {
            this.state.view = "main";
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:add_option") {
            const num = this.state.options.length + 1;
            await this.showModal(
                i,
                "add_option",
                `Option ${num}`,
                `Enter option ${num}`,
                TextInputStyle.Short,
                MAX_OPTION_LENGTH,
            );
            return;
        }

        if (id.startsWith("poll:create:option:remove:")) {
            const index = Number.parseInt(id.split(":")[4] ?? "", 10);
            if (Number.isInteger(index) && index >= 0 && index < this.state.options.length) {
                this.state.options.splice(index, 1);
            }
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:duration") {
            await this.showModal(
                i,
                "duration",
                "Poll duration",
                "e.g. 30m, 2h, 5d, 1w",
                TextInputStyle.Short,
                10,
                this.state.duration ?? undefined,
            );
            return;
        }

        if (id === "poll:create:clear_duration") {
            this.state.duration = null;
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:toggle:anonymous") {
            this.state.anonymous = !this.state.anonymous;
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:toggle:multi_select") {
            this.state.multiSelect = !this.state.multiSelect;
            if (this.state.multiSelect) this.state.rankedChoice = false; // mutually exclusive with ranked choice
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:toggle:ranked_choice") {
            this.state.rankedChoice = !this.state.rankedChoice;
            if (this.state.rankedChoice) this.state.multiSelect = false; // mutually exclusive with multi-select
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:submit") {
            collector.stop("submitted");
            await i.deferUpdate();
            await this.submit();
            return;
        }
    }

    private async handleRoleSelect(i: RoleSelectMenuInteraction) {
        if (i.customId === "poll:create:whitelist") {
            this.state.whitelistRoleIds = [...i.values];
        } else if (i.customId === "poll:create:blacklist") {
            this.state.blacklistRoleIds = [...i.values];
        }
        await i.update({ components: [this.buildContainer()] });
    }

    // ─── Modal helpers ─────────────────────────────────────────────────────────

    private async showModal(
        i: ButtonInteraction,
        key: string,
        title: string,
        placeholder: string,
        style: TextInputStyle,
        maxLength: number,
        prefill?: string,
    ) {
        // Unique per call so a double-triggered modal can't have two listeners resolve the same submission.
        const customId = `poll:create:modal:${key}:${++this.modalNonce}`;

        const input = new TextInputBuilder()
            .setCustomId("value")
            .setLabel(title)
            .setStyle(style)
            .setPlaceholder(placeholder)
            .setMaxLength(maxLength)
            .setRequired(true);

        if (prefill) input.setValue(prefill);

        const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle(title)
            .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

        await i.showModal(modal);

        try {
            const submit = await i.awaitModalSubmit({
                filter: (m) => m.customId === customId && m.user.id === this.interaction.user.id,
                time: 120_000,
            });

            const value = submit.fields.getTextInputValue("value").trim();
            await this.handleModalValue(key, value, submit);
        } catch {
            // User dismissed modal - no action needed
        }
    }

    private async handleModalValue(key: string, value: string, submit: ModalSubmitInteraction) {
        if (key === "question") {
            this.state.question = value;
        } else if (key === "add_option") {
            if (value.length > MAX_OPTION_LENGTH) {
                // Shouldn't reach here due to setMaxLength, but guard anyway
                return;
            }
            this.state.options.push(value);
        } else if (key === "duration") {
            const ms = parseDuration(value);
            if (!ms) {
                // Show error via ephemeral - can't update ephemeral from modal submit directly
                await submit.deferUpdate();
                await this.render();
                await this.interaction.followUp({
                    content:
                        "Invalid duration. Use a number followed by m, h, d, or w (max 4 weeks).",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            this.state.duration = value;
        }

        await submit.deferUpdate();
        await this.render();
    }

    // ─── Submit ────────────────────────────────────────────────────────────────

    private async submit() {
        const {
            question,
            options,
            duration,
            anonymous,
            multiSelect,
            rankedChoice,
            whitelistRoleIds,
            blacklistRoleIds,
        } = this.state;

        if (!question || options.length < 2) {
            await this.interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents((t) =>
                        t.setContent("❌ Poll needs a question and at least 2 options."),
                    ),
                ],
            });
            return;
        }

        const guildId = this.interaction.guildId!;

        let expiresAt: Date | null = null;
        if (duration) {
            const ms = parseDuration(duration);
            if (ms) expiresAt = new Date(Date.now() + ms);
        }

        // Creating poll…
        await this.interaction.editReply({
            components: [
                new ContainerBuilder()
                    .setAccentColor(DEFAULT_EMBED_COLOR)
                    .addTextDisplayComponents((t) => t.setContent("# Create Poll\n\nCreating…")),
            ],
        });

        try {
            const channel = await this.interaction.guild?.channels.fetch(this.pollChannelId);
            if (!channel?.isSendable()) {
                await this.interaction.editReply({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents((t) =>
                            t.setContent("❌ The configured polls channel is not accessible."),
                        ),
                    ],
                });
                return;
            }

            const [poll] = await db
                .insert(polls)
                .values({
                    guildId,
                    channelId: this.pollChannelId,
                    messageId: "0",
                    question,
                    createdBy: this.interaction.user.id,
                    multiSelect,
                    anonymous,
                    rankedChoice,
                    expiresAt,
                    showProgressBars: this.showProgressBars,
                    optionMarkerStyle: this.markerStyle,
                })
                .returning();

            if (!poll) return;

            const insertedOptions = await db
                .insert(pollOptions)
                .values(options.map((label) => ({ pollId: poll.id, label })))
                .returning();

            // Insert role restrictions
            const roleRows = [
                ...whitelistRoleIds.map((roleId) => ({
                    pollId: poll.id,
                    roleId,
                    type: "whitelist" as const,
                })),
                ...blacklistRoleIds.map((roleId) => ({
                    pollId: poll.id,
                    roleId,
                    type: "blacklist" as const,
                })),
            ];
            if (roleRows.length > 0) {
                await db.insert(pollRoles).values(roleRows);
            }

            const roleNames = resolveRoleNames(this.interaction.guild ?? undefined, roleRows, {
                roleWhitelistId: null,
                roleBlacklistId: null,
            });

            // Build poll message
            const pollContainer = buildPollContainer(
                question,
                insertedOptions,
                [],
                this.interaction.user.id,
                expiresAt,
                rankedChoice,
                this.showProgressBars,
                this.markerStyle,
                roleNames,
            );
            const voteRows = buildVoteRows(
                { id: poll.id, rankedChoice, multiSelect, anonymous },
                insertedOptions,
                this.markerStyle,
            );

            const message = await channel.send({
                components: [pollContainer, ...voteRows],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { parse: [] },
            });
            await db.update(polls).set({ messageId: message.id }).where(eq(polls.id, poll.id));

            if (expiresAt) {
                schedulePollExpiry(this.interaction.client, { id: poll.id, expiresAt });
            }

            await this.interaction.editReply({
                components: [
                    new ContainerBuilder()
                        .setAccentColor(DEFAULT_EMBED_COLOR)
                        .addTextDisplayComponents((t) =>
                            t.setContent(
                                `# Create Poll\n\nPoll created in <#${this.pollChannelId}>!`,
                            ),
                        ),
                ],
            });
        } catch (error) {
            console.error("Failed to create poll:", error);
            await this.interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents((t) =>
                        t.setContent("❌ Failed to create poll. Please try again."),
                    ),
                ],
            });
        }
    }
}
