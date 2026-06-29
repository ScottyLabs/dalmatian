import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    RoleSelectMenuBuilder,
    type RoleSelectMenuInteraction,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { eq } from "drizzle-orm";
import { db, pollOptions, pollRoles, polls } from "../db/index.ts";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import { buildPollEmbed, buildSeeVotersRow, schedulePollExpiry } from "./pollVotes.ts";

const MAX_OPTIONS = 10;
const MAX_OPTION_LENGTH = 100;
const MAX_QUESTION_LENGTH = 256;
const MAX_DURATION_MS = 4 * 7 * 24 * 60 * 60 * 1000; // 4 weeks

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

interface PollFormState {
    question: string | null;
    options: string[];
    duration: string | null;
    anonymous: boolean;
    multiSelect: boolean;
    rankedChoice: boolean;
    whitelistRoleIds: string[];
    blacklistRoleIds: string[];
}

export class PollCreateForm {
    private state: PollFormState = {
        question: null,
        options: [],
        duration: null,
        anonymous: false,
        multiSelect: false,
        rankedChoice: false,
        whitelistRoleIds: [],
        blacklistRoleIds: [],
    };

    constructor(
        private interaction: ChatInputCommandInteraction,
        private pollChannelId: string,
    ) {}

    async start() {
        await this.interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.render();
        await this.listen();
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    private async render() {
        await this.interaction.editReply({
            components: [this.buildContainer()],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    private buildContainer(): ContainerBuilder {
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
            ? options.map((o, i) => `${i + 1}. ${o}`).join("\n")
            : "*No options yet*";
        const optionsHeader = `**Options** (${options.length}/${MAX_OPTIONS}) ${options.length < 2 ? "*\\*min 2 required*" : ""}`;
        container.addTextDisplayComponents((t) =>
            t.setContent(`${optionsHeader}\n${optionsLines}`),
        );

        const optionBtns = [
            new ButtonBuilder()
                .setCustomId("poll:create:add_option")
                .setLabel("+ Add option")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(options.length >= MAX_OPTIONS),
        ];
        if (options.length > 0) {
            optionBtns.push(
                new ButtonBuilder()
                    .setCustomId("poll:create:remove_option")
                    .setLabel("Remove last")
                    .setStyle(ButtonStyle.Danger),
            );
        }
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(...optionBtns),
        );

        // ── Duration ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const durationText = duration
            ? `**Duration**\n> ${duration}`
            : "**Duration** *(optional — e.g. 30m, 2h, 5d, 1w, max 4w)*";
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
                    .setLabel(anonymous ? "✓ Anonymous" : "Anonymous")
                    .setStyle(anonymous ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("poll:create:toggle:multi_select")
                    .setLabel(multiSelect ? "✓ Multi-select" : "Multi-select")
                    .setStyle(multiSelect ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(rankedChoice),
                new ButtonBuilder()
                    .setCustomId("poll:create:toggle:ranked_choice")
                    .setLabel(rankedChoice ? "✓ Ranked choice" : "Ranked choice")
                    .setStyle(rankedChoice ? ButtonStyle.Success : ButtonStyle.Secondary),
            ),
        );

        // ── Role restrictions ──
        container.addSeparatorComponents(new SeparatorBuilder());

        const conflictNote =
            whitelistRoleIds.length > 0 && blacklistRoleIds.length > 0
                ? "\n⚠️ *Cannot use both whitelist and blacklist — clear one before creating*"
                : "";

        const whitelistLabel =
            whitelistRoleIds.length > 0
                ? `**Voter whitelist** (${whitelistRoleIds.length} role${whitelistRoleIds.length !== 1 ? "s" : ""} — must have any)\n${whitelistRoleIds.map((id) => `<@&${id}>`).join("  ")}`
                : "**Voter whitelist** *(optional — only these roles can vote)*";
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
                ? `**Voter blacklist** (${blacklistRoleIds.length} role${blacklistRoleIds.length !== 1 ? "s" : ""} — must not have any)\n${blacklistRoleIds.map((id) => `<@&${id}>`).join("  ")}`
                : "**Voter blacklist** *(optional — these roles cannot vote)*";
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

    // ─── Listener ──────────────────────────────────────────────────────────────

    private async listen() {
        const collector = this.interaction.channel?.createMessageComponentCollector({
            filter: (i) => i.user.id === this.interaction.user.id,
            time: 10 * 60 * 1000, // 10 minutes
        });

        if (!collector) return;

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
            if (reason !== "submitted") {
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

        if (id === "poll:create:remove_option") {
            this.state.options.pop();
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
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (id === "poll:create:toggle:ranked_choice") {
            this.state.rankedChoice = !this.state.rankedChoice;
            if (this.state.rankedChoice) this.state.multiSelect = false; // ranked implies multi
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
        const input = new TextInputBuilder()
            .setCustomId("value")
            .setLabel(title)
            .setStyle(style)
            .setPlaceholder(placeholder)
            .setMaxLength(maxLength)
            .setRequired(true);

        if (prefill) input.setValue(prefill);

        const modal = new ModalBuilder()
            .setCustomId(`poll:create:modal:${key}`)
            .setTitle(title)
            .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

        await i.showModal(modal);

        try {
            const submit = await i.awaitModalSubmit({
                filter: (m) =>
                    m.customId === `poll:create:modal:${key}` &&
                    m.user.id === this.interaction.user.id,
                time: 120_000,
            });

            const value = submit.fields.getTextInputValue("value").trim();
            await this.handleModalValue(key, value, submit);
        } catch {
            // User dismissed modal — no action needed
        }
    }

    private async handleModalValue(
        key: string,
        value: string,
        submit: { deferUpdate: () => Promise<void> },
    ) {
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
                // Show error via ephemeral — can't update ephemeral from modal submit directly
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

            // Build poll message
            const embed = buildPollEmbed(
                question,
                insertedOptions,
                [],
                anonymous,
                this.interaction.user.id,
                expiresAt,
                rankedChoice,
            );

            const isMultiChoice = multiSelect || rankedChoice;
            const placeholder = rankedChoice
                ? "Rank by preference"
                : multiSelect
                  ? "Vote for one or more options"
                  : "Vote for an option";

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`poll:vote:${poll.id}`)
                .setPlaceholder(placeholder)
                .setMaxValues(isMultiChoice ? insertedOptions.length : 1)
                .addOptions([
                    ...insertedOptions.map((opt) => ({ label: opt.label, value: String(opt.id) })),
                    { label: "Clear vote", value: "unvote" },
                ]);

            const components: ActionRowBuilder<any>[] = [
                new ActionRowBuilder().addComponents(selectMenu),
            ];
            if (!anonymous) {
                components.push(buildSeeVotersRow(poll.id));
            }

            const message = await channel.send({ embeds: [embed], components });
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
                                `# Create Poll\n\n✅ Poll created in <#${this.pollChannelId}>!`,
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
