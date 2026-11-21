import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    ChannelType,
    type ChatInputCommandInteraction,
    ContainerBuilder,
    type Message,
    MessageFlags,
    ModalBuilder,
    type ModalSubmitInteraction,
    PermissionFlagsBits,
    SeparatorBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { DEFAULT_EMBED_COLOR, SCOTTYLABS_URL } from "../constants.ts";
import type { SlashCommand } from "../types.d.ts";
import { db, pollSettings } from "../db/index.ts";
import { eq } from "drizzle-orm";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a poll in the Discord channel")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Open the poll editor to build and post a poll"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("delete")
                .setDescription("Delete a poll in the Discord channel (needs Manage Messages)")
                .addStringOption((option) =>
                    option
                        .setName("message_id")
                        .setDescription("ID of the poll message (right-click it > Copy Message ID)")
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("set")
                .setDescription("Admin only, Set polls to specific channels")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel that polls will be sent to")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true),
                ),
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: "This command only works in a server.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "create") {
            return createPoll(interaction);
        } else if (subcommand === "delete") {
            return deletePoll(interaction);
        } else if (subcommand === "set") {
            return setPollChannel(interaction);
        }
    },
    /* We still need to create functions that use the pollEditor class to create a ContainerBuilder for user interaction
setPollChannel should be set to admin only
*/
};

// Limits set
const MAX_QUESTION_LENGTH = 300;
const MAX_ANSWER_LENGTH = 55;
const MAX_ANSWERS = 10;

const POLL_DURATION_HOURS = 768;

const EDITOR_TIMEOUT_MS = 600_000; // 10 minutes
const MODAL_TIMEOUT_MS = 300_000; // 5 minutes

interface PollDraft {
    question: string;
    answers: string[];
    allowMultiselect: boolean;
}

type PostPoll = (draft: PollDraft) => Promise<string>;

/* The interactive poll editor, built the same way as the credit calculator form
A container is rendered and will take the inputs of the user to perform the user's prefered task
 */
class pollEditor {
    private interaction: ChatInputCommandInteraction;
    private onPost: PostPoll;
    private draft: PollDraft = {
        question: "",
        answers: [],
        allowMultiselect: false,
    };
    // Shown at the bottom of the editor after a failed post, cleared on the next change
    private errorText: string | null = null;

    constructor(interaction: ChatInputCommandInteraction, onPost: PostPoll) {
        this.interaction = interaction;
        this.onPost = onPost;
    }

    async start(): Promise<void> {
        // Ephemeral so only the person making the poll sees the editor
        await this.interaction.reply({
            components: [this.buildContainer()],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });

        const message = await this.interaction.fetchReply();
        this.handleInteractions(message);
    }

    private id(action: string): string {
        return `poll;${this.interaction.id};${action}`;
    }

    private isReady(): boolean {
        return this.draft.question.length > 0 && this.draft.answers.length >= 2;
    }

    private buildContainer(): ContainerBuilder {
        const { question, answers, allowMultiselect } = this.draft;

        const container = new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((text) => text.setContent("# Poll Editor"));

        // Question
        container.addSectionComponents((section) =>
            section
                .addTextDisplayComponents((text) =>
                    text.setContent(`**Question**\n${question || "*Not set yet*"}`),
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(this.id("question"))
                        .setLabel(question ? "Edit" : "Set question")
                        .setStyle(ButtonStyle.Secondary),
                ),
        );
        container.addSeparatorComponents(new SeparatorBuilder());

        // Answers
        const answerList =
            answers.length > 0
                ? answers.map((answer, i) => `${i + 1}. ${answer}`).join("\n")
                : "*Add at least 2 answers*";
        container.addTextDisplayComponents((text) =>
            text.setContent(`**Answers (${answers.length}/${MAX_ANSWERS})**\n${answerList}`),
        );

        const answerButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(this.id("add"))
                .setLabel("Add answer")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(answers.length >= MAX_ANSWERS),
        );
        container.addActionRowComponents(answerButtons);

        if (answers.length > 0) {
            const removeSelect = new StringSelectMenuBuilder()
                .setCustomId(this.id("remove"))
                .setPlaceholder("Remove an answer")
                .addOptions(answers.map((answer, i) => ({ label: answer, value: i.toString() })));
            container.addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect),
            );
        }
        container.addSeparatorComponents(new SeparatorBuilder());

        // Multiselect toggle
        container.addSectionComponents((section) =>
            section
                .addTextDisplayComponents((text) =>
                    text.setContent(
                        `**Multiple answers**\n${allowMultiselect ? "People can pick more than one answer" : "People pick one answer"}`,
                    ),
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(this.id("multiselect"))
                        .setLabel(allowMultiselect ? "On" : "Off")
                        .setStyle(allowMultiselect ? ButtonStyle.Success : ButtonStyle.Secondary),
                ),
        );
        container.addSeparatorComponents(new SeparatorBuilder());

        if (this.errorText) {
            container.addTextDisplayComponents((text) => text.setContent(`⚠️ ${this.errorText}`));
        }

        container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(this.id("post"))
                    .setLabel("Post poll")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!this.isReady()),
                new ButtonBuilder()
                    .setCustomId(this.id("cancel"))
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger),
            ),
        );

        return container;
    }

    private buildFinalContainer(content: string): ContainerBuilder {
        return new ContainerBuilder()
            .setAccentColor(DEFAULT_EMBED_COLOR)
            .addTextDisplayComponents((text) => text.setContent(content));
    }

    private handleInteractions(message: Message): void {
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === this.interaction.user.id,
            time: EDITOR_TIMEOUT_MS,
        });

        collector.on("collect", async (i) => {
            const action = i.customId.split(";")[2];

            if (i.isStringSelectMenu()) {
                this.errorText = null;
                if (action === "remove") {
                    this.draft.answers.splice(Number(i.values[0]), 1);
                }
                await i.update({ components: [this.buildContainer()] });
                return;
            }

            if (!i.isButton()) return;

            switch (action) {
                case "question":
                    await this.askForText(
                        i,
                        "Poll question",
                        MAX_QUESTION_LENGTH,
                        this.draft.question,
                        (value) => {
                            this.draft.question = value;
                        },
                    );
                    break;

                case "add":
                    await this.askForText(i, "New answer", MAX_ANSWER_LENGTH, "", (value) => {
                        if (this.draft.answers.length < MAX_ANSWERS) this.draft.answers.push(value);
                    });
                    break;

                case "multiselect":
                    this.errorText = null;
                    this.draft.allowMultiselect = !this.draft.allowMultiselect;
                    await i.update({ components: [this.buildContainer()] });
                    break;

                case "post":
                    await i.deferUpdate();
                    try {
                        const url = await this.onPost(this.draft);
                        collector.stop("posted");
                        await this.interaction.editReply({
                            components: [this.buildFinalContainer(` Poll posted! ${url}`)],
                        });
                    } catch (error) {
                        // Keep the editor open so the user can fix the problem and try again
                        this.errorText = error instanceof Error ? error.message : String(error);
                        await this.interaction.editReply({ components: [this.buildContainer()] });
                    }
                    break;

                case "cancel":
                    collector.stop("cancelled");
                    await i.update({ components: [this.buildFinalContainer("Poll cancelled.")] });
                    break;
            }
        });

        collector.on("end", async (_collected, reason) => {
            if (reason === "time") {
                await this.interaction.editReply({
                    components: [
                        this.buildFinalContainer(
                            "Poll editor timed out. Run `/poll create` again.",
                        ),
                    ],
                });
            }
        });
    }

    /**
     * Opens a modal with one text box, then re-renders the editor with the new value.
     * Modal submits aren't seen by the message collector, so we wait for it separately.
     */
    private async askForText(
        button: ButtonInteraction,
        label: string,
        maxLength: number,
        currentValue: string,
        apply: (value: string) => void,
    ): Promise<void> {
        const modalId = `${this.id("modal")};${button.id}`;
        const input = new TextInputBuilder()
            .setCustomId("value")
            .setLabel(label)
            .setStyle(maxLength > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setMaxLength(maxLength)
            .setRequired(true);
        if (currentValue) input.setValue(currentValue);

        await button.showModal(
            new ModalBuilder()
                .setCustomId(modalId)
                .setTitle(label)
                .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
        );

        let submitted: ModalSubmitInteraction;
        try {
            submitted = await button.awaitModalSubmit({
                filter: (m) => m.customId === modalId,
                time: MODAL_TIMEOUT_MS,
            });
        } catch {
            return; // Modal closed or timed out, nothing to change
        }

        const value = submitted.fields.getTextInputValue("value").trim();
        if (value) {
            this.errorText = null;
            apply(value);
        }

        if (submitted.isFromMessage()) {
            await submitted.update({ components: [this.buildContainer()] });
        } else {
            await submitted.deferUpdate();
        }
    }
}

// Subcommand handlers

/**
 * Finds the channel polls should go to
 */
async function getPollChannel(interaction: ChatInputCommandInteraction<"cached" | "raw">) {
    const [settings] = await db
        .select()
        .from(pollSettings)
        .where(eq(pollSettings.guildId, interaction.guildId));

    if (settings) {
        const channel = await interaction.client.channels
            .fetch(settings.channelId)
            .catch(() => null);
        if (channel?.isSendable()) return channel;
    }

    return interaction.channel ?? null;
}

async function createPoll(interaction: ChatInputCommandInteraction<"cached" | "raw">) {
    // The editor handles question, answers and multiselect.
    // This callback runs when the user presses "Post poll".
    const editor = new pollEditor(interaction, async (draft) => {
        const channel = await getPollChannel(interaction);
        if (!channel?.isSendable()) {
            throw new Error(
                "I can't send messages in the poll channel. Ask an admin to check `/poll set`.",
            );
        }

        try {
            const message = await channel.send({
                poll: {
                    question: { text: draft.question },
                    answers: draft.answers.map((text) => ({ text })),
                    duration: POLL_DURATION_HOURS,
                    allowMultiselect: draft.allowMultiselect,
                },
            });
            return message.url;
        } catch {
            throw new Error(
                "Couldn't post the poll. Missing the Send Polls permission in that channel?",
            );
        }
    });

    await editor.start();
}

async function deletePoll(interaction: ChatInputCommandInteraction<"cached" | "raw">) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            content: "You need the Manage Messages permission to delete polls.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const messageId = interaction.options.getString("message_id", true).trim();
    const channel = await getPollChannel(interaction);
    const message =
        channel && "messages" in channel
            ? await channel.messages.fetch(messageId).catch(() => null)
            : null;

    if (!message?.poll || message.author.id !== interaction.client.user.id) {
        return interaction.reply({
            content: "I couldn't find a poll of mine with that message ID in the poll channel.",
            flags: MessageFlags.Ephemeral,
        });
    }

    await message.delete();
    return interaction.reply({ content: "Poll deleted.", flags: MessageFlags.Ephemeral });
}

async function setPollChannel(interaction: ChatInputCommandInteraction<"cached" | "raw">) {
    // setDefaultMemberPermissions can only lock the whole /poll command, so "set" checks here instead
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: "Only server admins can choose the poll channel.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const channel = interaction.options.getChannel("channel", true);

    await db
        .insert(pollSettings)
        .values({ guildId: interaction.guildId, channelId: channel.id })
        .onConflictDoUpdate({
            target: pollSettings.guildId,
            set: { channelId: channel.id, updatedAt: new Date() },
        });

    return interaction.reply({
        content: `Polls will now be sent to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
    });
}

export default command;
