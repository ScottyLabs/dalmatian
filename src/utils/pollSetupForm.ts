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
    SeparatorBuilder,
} from "discord.js";
import { eq } from "drizzle-orm";
import { db, type OptionMarkerStyle, pollConfig } from "../db/index.ts";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";

interface PollSetupState {
    channelId: string | null;
    showProgressBars: boolean;
    optionMarkerStyle: OptionMarkerStyle;
}

/** Buttons-in-a-container setup flow for `/pollsetup`, matching PollCreateForm's style. */
export class PollSetupForm {
    private state: PollSetupState = {
        channelId: null,
        showProgressBars: true,
        optionMarkerStyle: "letter",
    };

    constructor(private interaction: ChatInputCommandInteraction) {}

    async start() {
        await this.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (this.interaction.guildId) {
            const [existing] = await db
                .select()
                .from(pollConfig)
                .where(eq(pollConfig.guildId, this.interaction.guildId))
                .limit(1);
            if (existing) {
                this.state.channelId = existing.channelId;
                this.state.showProgressBars = existing.showProgressBars;
                this.state.optionMarkerStyle = existing.optionMarkerStyle;
            }
        }

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
        const { channelId, showProgressBars, optionMarkerStyle } = this.state;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((t) => t.setContent("# Poll Setup"));

        // ── Polls channel ──
        container.addSeparatorComponents(new SeparatorBuilder());
        const channelText = channelId
            ? `**Polls channel**\n> <${channelId}>`
            : "**Polls channel** *\\*required*\nWhere new polls will be posted";
        container.addTextDisplayComponents((t) => t.setContent(channelText));
        container.addActionRowComponents(
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId("pollsetup:channel")
                    .setPlaceholder("Select the polls channel…")
                    .setChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1),
            ),
        );

        // ── Progress bars ──
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents((t) =>
            t.setContent(
                "**Progress bars**\nShown on live polls and results. If off, only the percentage is shown.",
            ),
        );
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("pollsetup:bars:on")
                    .setLabel("Progress bars on")
                    .setStyle(showProgressBars ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("pollsetup:bars:off")
                    .setLabel("Progress bars off")
                    .setStyle(!showProgressBars ? ButtonStyle.Success : ButtonStyle.Secondary),
            ),
        );

        // ── Option markers ──
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents((t) =>
            t.setContent(
                "**Option markers**\nShown beside each option and in the voting dropdown.",
            ),
        );
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("pollsetup:marker:letter")
                    .setLabel("Letters")
                    .setStyle(
                        optionMarkerStyle === "letter"
                            ? ButtonStyle.Success
                            : ButtonStyle.Secondary,
                    ),
                new ButtonBuilder()
                    .setCustomId("pollsetup:marker:number")
                    .setLabel("Numbers")
                    .setStyle(
                        optionMarkerStyle === "number"
                            ? ButtonStyle.Success
                            : ButtonStyle.Secondary,
                    ),
            ),
        );

        // ── Submit ──
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("pollsetup:submit")
                    .setLabel("Save")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!channelId),
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

        collector.on("collect", async (i) => {
            try {
                if (i.isButton()) await this.handleButton(i as ButtonInteraction, collector);
                else if (i.isChannelSelectMenu())
                    await this.handleChannelSelect(i as ChannelSelectMenuInteraction);
            } catch (err) {
                console.error("PollSetupForm error:", err);
            }
        });

        collector.on("end", async (_c, reason) => {
            if (reason !== "submitted") {
                await this.interaction
                    .editReply({
                        components: [
                            new ContainerBuilder().addTextDisplayComponents((t) =>
                                t.setContent("Poll setup timed out."),
                            ),
                        ],
                    })
                    .catch(() => {});
            }
        });
    }

    private async handleChannelSelect(i: ChannelSelectMenuInteraction) {
        this.state.channelId = i.values[0] ?? null;
        await i.update({ components: [this.buildContainer()] });
    }

    private async handleButton(i: ButtonInteraction, collector: any) {
        if (i.customId === "pollsetup:bars:on" || i.customId === "pollsetup:bars:off") {
            this.state.showProgressBars = i.customId === "pollsetup:bars:on";
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (i.customId === "pollsetup:marker:letter" || i.customId === "pollsetup:marker:number") {
            this.state.optionMarkerStyle =
                i.customId === "pollsetup:marker:letter" ? "letter" : "number";
            await i.update({ components: [this.buildContainer()] });
            return;
        }

        if (i.customId === "pollsetup:submit") {
            collector.stop("submitted");
            await i.deferUpdate();
            await this.submit();
            return;
        }
    }

    // ─── Submit ────────────────────────────────────────────────────────────────

    private async submit() {
        const { channelId, showProgressBars, optionMarkerStyle } = this.state;
        if (!channelId || !this.interaction.guildId) return;

        try {
            await db
                .insert(pollConfig)
                .values({
                    guildId: this.interaction.guildId,
                    channelId,
                    showProgressBars,
                    optionMarkerStyle,
                })
                .onConflictDoUpdate({
                    target: pollConfig.guildId,
                    set: { channelId, showProgressBars, optionMarkerStyle },
                });

            await this.interaction.editReply({
                components: [
                    new ContainerBuilder()
                        .setAccentColor(DEFAULT_EMBED_COLOR)
                        .addTextDisplayComponents((t) =>
                            t.setContent(
                                `# Poll Setup\n\nPolls will be posted in <#${channelId}>, with progress bars ${
                                    showProgressBars ? "on" : "off"
                                } and ${optionMarkerStyle} markers.`,
                            ),
                        ),
                ],
            });
        } catch (error) {
            console.error("Failed to save poll setup:", error);
            await this.interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents((t) =>
                        t.setContent("❌ Failed to save poll setup. Please try again."),
                    ),
                ],
            });
        }
    }
}
