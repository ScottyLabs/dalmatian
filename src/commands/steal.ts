import { EmbedBuilder, SlashCommandBuilder, StickerFormatType } from "discord.js";
import type { SlashCommand } from "../types.d.ts";

async function fetchEmojiUrl(
    emojiId: string,
): Promise<{ url: string; animated: boolean } | null> {
    const gifUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?size=128`;
    const pngUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?size=128`;

    const gifRes = await fetch(gifUrl);
    if (gifRes.ok) return { url: gifUrl, animated: true };

    const pngRes = await fetch(pngUrl);
    if (pngRes.ok) return { url: pngUrl, animated: false };

    return null;
}

async function fetchStickerUrl(
    stickerId: string,
): Promise<{ url: string; format: "png" | "gif" } | null> {
    const gifUrl = `https://cdn.discordapp.com/stickers/${stickerId}.gif?size=320`;
    const pngUrl = `https://cdn.discordapp.com/stickers/${stickerId}.png?size=320`;

    const gifRes = await fetch(gifUrl);
    if (gifRes.ok) return { url: gifUrl, format: "gif" };

    const pngRes = await fetch(pngUrl);
    if (pngRes.ok) return { url: pngUrl, format: "png" };

    return null;
}

/**
 * Accepts a raw snowflake, or a full emoji string like `<:name:id>` or `<a:name:id>`.
 * Returns the extracted id and (if available) the original name.
 */
function parseEmojiInput(
    input: string,
): { id: string; name?: string; animated?: boolean } {
    const match = input.match(/^<(a?):(\w+):(\d+)>$/);
    if (match) {
        const [, animated, name, id] = match as unknown as [
            string,
            string,
            string,
            string,
        ];
        return { id, name, animated: animated === "a" };
    }
    return { id: input };
}

function sanitizeName(name: string): string {
    return name.trim().replace(/\s+/g, "_");
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("steal")
        .setDescription(
            "Steals emotes, stickers, or soundboards from another server.",
        )
        .addStringOption((option) =>
            option
                .setName("id")
                .setDescription(
                    "A message ID, emote (ID or `<:name:id>`), sticker ID, or sound effect ID.",
                )
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription(
                    "Optional name override. Defaults to the original name when available.",
                )
                .setRequired(false),
        ),

    async execute(interaction) {
        const rawInput = interaction.options.getString("id", true).trim();
        const providedName = interaction.options
            .getString("name")
            ?.trim()
            .replace(/\s+/g, "_");
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content: "This command must be used in a server.",
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // Accept raw IDs or full emoji strings like `<:name:id>`
        const parsed = parseEmojiInput(rawInput);
        const id = parsed.id;

        // --- Attempt 1: Treat as an emoji ID (works cross-server via CDN) ---
        const emojiData = await fetchEmojiUrl(id);
        if (emojiData) {
            try {
                const finalName = sanitizeName(
                    providedName ?? parsed.name ?? "stolen_emoji",
                );
                const added = await guild.emojis.create({
                    attachment: emojiData.url,
                    name: finalName,
                });
                const embed = new EmbedBuilder()
                    .setTitle(
                        `${emojiData.animated ? "Animated " : ""}Emoji Added!`,
                    )
                    .setDescription(
                        `Added ${added} (\`${added.name}\`) to the server.`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                return interaction.editReply({
                    content: `Found the emoji but failed to add it: ${err}`,
                });
            }
        }

        // --- Attempt 2: Treat as a sticker ID (works cross-server via CDN) ---
        const stickerData = await fetchStickerUrl(id);
        if (stickerData) {
            try {
                const finalName = sanitizeName(providedName ?? "stolen_sticker");
                const added = await guild.stickers.create({
                    file: stickerData.url,
                    name: finalName,
                    tags: "grinning",
                });
                const embed = new EmbedBuilder()
                    .setTitle("Sticker Added!")
                    .setDescription(
                        `Added sticker **${added.name}** to the server.`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                return interaction.editReply({
                    content: `Found the sticker but failed to add it: ${err}`,
                });
            }
        }

        // --- Attempt 3: Treat as a sound effect ID ---
        try {
            const sounds = (await guild.client.rest.get(
                `/guilds/${guild.id}/soundboard-sounds`,
            )) as { items: Array<{ sound_id: string; name: string }> };
            const defaultSounds = (await guild.client.rest.get(
                `/soundboard-default-sounds`,
            )) as Array<{ sound_id: string; name: string }>;
            const allSounds = [
                ...(sounds.items ?? []),
                ...(defaultSounds ?? []),
            ];
            const sound = allSounds.find((s) => s.sound_id === id);

            if (sound) {
                await guild.client.rest.post(
                    `/guilds/${guild.id}/soundboard-sounds`,
                    {
                        body: {
                            sound_id: sound.sound_id,
                            name: providedName ?? sound.name,
                        },
                    },
                );
                const embed = new EmbedBuilder()
                    .setTitle("Sound Added!")
                    .setDescription(
                        `Added soundboard sound **${sound.name}** to this server.`,
                    );
                return interaction.editReply({ embeds: [embed] });
            }
        } catch {
            // Not a sound ID, continue
        }

        // --- Attempt 4: Treat as a message ID — scan visible channels ---
        const channels = guild.channels.cache.filter((c) => c.isTextBased());

        for (const [, channel] of channels) {
            if (!channel.isTextBased()) continue;
            try {
                const message = await channel.messages.fetch(id);

                // Stickers attached to the message take precedence
                const sticker = message.stickers.first();
                if (sticker) {
                    if (sticker.format === StickerFormatType.Lottie) {
                        return interaction.editReply({
                            content:
                                "That message has a Lottie sticker, which can't be re-uploaded.",
                        });
                    }
                    const ext =
                        sticker.format === StickerFormatType.GIF ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}?size=320`;
                    const finalName = sanitizeName(
                        providedName ?? sticker.name,
                    );
                    const added = await guild.stickers.create({
                        file: url,
                        name: finalName,
                        tags: sticker.tags ?? "grinning",
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Sticker Added!")
                        .setDescription(
                            `Stole sticker **${added.name}** from message.`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

                const emojiMatch = message.content.match(/<(a?):(\w+):(\d+)>/);
                if (emojiMatch) {
                    const [, animated, emojiName, emojiId] = emojiMatch;
                    const ext = animated ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128`;
                    const finalName = sanitizeName(
                        providedName ?? emojiName ?? "stolen_emoji",
                    );

                    const added = await guild.emojis.create({
                        attachment: url,
                        name: finalName,
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Emoji Added!")
                        .setDescription(
                            `Stole ${added} (\`${added.name}\`) from message.`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }
                break;
            } catch {
                // Message not in this channel, try next
            }
        }

        return interaction.editReply({
            content:
                "Could not find a valid emoji, sticker, sound, or message with that ID.",
        });
    },
};

export default command;
