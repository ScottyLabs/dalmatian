import {
    ApplicationCommandType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    InteractionContextType,
    type MessageContextMenuCommandInteraction,
    MessageFlags,
    StickerFormatType,
} from "discord.js";

import type { MessageContextCommand } from "../types.d.ts";

function sanitizeName(name: string): string {
    return name.trim().replace(/\s+/g, "_");
}

const command: MessageContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName("Steal Emotes")
        .setType(ApplicationCommandType.Message)
        .setContexts(InteractionContextType.Guild),

    async execute(interaction: MessageContextMenuCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply({
                content: "This command can only be used in a server.",
            });
            return;
        }

        const message = interaction.targetMessage;

        // Dedupe emotes by ID so the same one isn't added twice if repeated in the message
        const emojiRegex = /<(a?):(\w+):(\d+)>/g;
        const emoteMatches = new Map<
            string,
            { name: string; animated: boolean }
        >();
        for (const match of message.content.matchAll(emojiRegex)) {
            const [, animated, name, id] = match as unknown as [
                string,
                string,
                string,
                string,
            ];
            if (!emoteMatches.has(id)) {
                emoteMatches.set(id, { name, animated: animated === "a" });
            }
        }

        if (emoteMatches.size === 0 && message.stickers.size === 0) {
            await interaction.editReply({
                content: "No custom emotes or stickers found in this message.",
            });
            return;
        }

        const added: string[] = [];
        const failed: string[] = [];

        for (const [id, info] of emoteMatches) {
            const ext = info.animated ? "gif" : "png";
            const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`;
            try {
                const emoji = await guild.emojis.create({
                    attachment: url,
                    name: sanitizeName(info.name),
                });
                added.push(`${emoji} \`${emoji.name}\``);
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                failed.push(`\`${info.name}\` — ${reason}`);
            }
        }

        for (const sticker of message.stickers.values()) {
            if (sticker.format === StickerFormatType.Lottie) {
                failed.push(
                    `sticker \`${sticker.name}\` — Lottie stickers can't be re-uploaded`,
                );
                continue;
            }
            const ext =
                sticker.format === StickerFormatType.GIF ? "gif" : "png";
            const url = `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}?size=320`;
            try {
                const created = await guild.stickers.create({
                    file: url,
                    name: sanitizeName(sticker.name),
                    tags: sticker.tags ?? "grinning",
                });
                added.push(`sticker **${created.name}**`);
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                failed.push(`sticker \`${sticker.name}\` — ${reason}`);
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
            .setDescription(sections.join("\n\n") || "Nothing happened.");

        await interaction.editReply({ embeds: [embed] });
    },
};

export default command;
