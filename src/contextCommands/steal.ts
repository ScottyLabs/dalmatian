import {
    ApplicationCommandType,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    InteractionContextType,
    type MessageContextMenuCommandInteraction,
    MessageFlags,
    ModalBuilder,
    parseEmoji,
    StickerFormatType,
    TextInputStyle,
} from "discord.js";

import type { MessageContextCommand } from "../types.d.ts";

const command: MessageContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName("Steal Emotes")
        .setType(ApplicationCommandType.Message)
        .setContexts(InteractionContextType.Guild),

    async execute(interaction: MessageContextMenuCommandInteraction) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({
                content: "This command can only be used in a server",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const message = interaction.targetMessage;

        const emoteMatches = new Map<
            string,
            { name: string; animated: boolean }
        >();
        for (const raw of message.content.match(/<a?:\w+:\d+>/g) ?? []) {
            const parsed = parseEmoji(raw);
            if (parsed?.id && parsed.name && !emoteMatches.has(parsed.id)) {
                emoteMatches.set(parsed.id, {
                    name: parsed.name,
                    animated: parsed.animated ?? false,
                });
            }
        }

        const hasNamedContent =
            emoteMatches.size > 0 || message.stickers.size > 0;

        const imageAttachment = message.attachments.find((a) =>
            a.contentType?.startsWith("image/"),
        );

        if (!hasNamedContent && !imageAttachment) {
            await interaction.reply({
                content:
                    "No custom emotes, stickers, or images found in this message",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (!hasNamedContent && imageAttachment) {
            const modal = new ModalBuilder({
                custom_id: "steal_image_name",
                title: "Enter name for this emoji",
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.TextInput,
                                custom_id: "emoji_name",
                                label: "Emoji name (2-32 chars w/ no spaces)",
                                style: TextInputStyle.Short,
                                required: true,
                                min_length: 2,
                                max_length: 32,
                            },
                        ],
                    },
                ],
            });

            await interaction.showModal(modal);

            let submitted;
            try {
                submitted = await interaction.awaitModalSubmit({
                    filter: (i) =>
                        i.customId === "steal_image_name" &&
                        i.user.id === interaction.user.id,
                    time: 60_000,
                });
            } catch {
                return;
            }

            await submitted.deferReply({ flags: MessageFlags.Ephemeral });

            const name = submitted.fields
                .getTextInputValue("emoji_name")
                .trim()
                .replace(/\s+/g, "_");

            try {
                const emoji = await guild.emojis.create({
                    attachment: imageAttachment.url,
                    name,
                });
                const embed = new EmbedBuilder()
                    .setTitle("Emoji Added")
                    .setDescription(
                        `Added ${emoji.toString()} (\`${emoji.name}\`) to the server`,
                    );
                await submitted.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("Failed to add emoji from image attachment", err);
                await submitted.editReply({
                    content: "Failed to add emoji",
                });
            }
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const added: string[] = [];
        const failed: string[] = [];

        for (const [id, info] of emoteMatches) {
            const ext = info.animated ? "gif" : "png";
            const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`;
            try {
                const emoji = await guild.emojis.create({
                    attachment: url,
                    name: info.name,
                });
                added.push(`${emoji.toString()} \`${emoji.name}\``);
            } catch (err) {
                console.error(`Failed to add emoji ${info.name}`, err);
                failed.push(`\`${info.name}\` — failed to add`);
            }
        }

        for (const sticker of message.stickers.values()) {
            const ext =
                sticker.format === StickerFormatType.GIF ? "gif" : "png";
            try {
                const stickerRes = await fetch(
                    `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}`,
                );
                if (!stickerRes.ok) throw new Error("Could not fetch sticker");
                const created = await guild.stickers.create({
                    file: {
                        attachment: Buffer.from(await stickerRes.arrayBuffer()),
                        name: `sticker.${ext}`,
                    },
                    name: sticker.name,
                    tags: sticker.tags ?? sticker.name,
                });
                added.push(`sticker **${created.name}**`);
            } catch (err) {
                console.error(`Failed to add sticker ${sticker.name}`, err);
                failed.push(`sticker \`${sticker.name}\` — failed to add`);
            }
        }

        const sections: string[] = [];
        if (added.length > 0) {
            sections.push(`**Added ${added.length}:**\n${added.join(", ")}`);
        }
        if (failed.length > 0) {
            sections.push(`**Failed ${failed.length}:**\n${failed.join("\n")}`);
        }

        const embed = new EmbedBuilder()
            .setTitle("Steal Emotes")
            .setDescription(sections.join("\n\n") || "Nothing happened");

        await interaction.editReply({ embeds: [embed] });
    },
};

export default command;
