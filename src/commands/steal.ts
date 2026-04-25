import {
    DiscordAPIError,
    EmbedBuilder,
    parseEmoji,
    RESTJSONErrorCodes,
    SlashCommandBuilder,
    StickerFormatType,
} from "discord.js";
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

async function fetchStickerAttachment(stickerId: string): Promise<{
    attachment: { attachment: Buffer; name: string };
    format: "png" | "gif";
} | null> {
    for (const format of ["gif", "png"] as const) {
        const res = await fetch(
            `https://cdn.discordapp.com/stickers/${stickerId}.${format}?size=320`,
        );
        if (res.ok) {
            return {
                attachment: {
                    attachment: Buffer.from(await res.arrayBuffer()),
                    name: `sticker.${format}`,
                },
                format,
            };
        }
    }
    return null;
}

function parseEmojiInput(input: string): {
    id: string;
    name?: string;
    animated?: boolean;
} {
    const parsed = parseEmoji(input);
    if (parsed?.id) {
        return {
            id: parsed.id,
            name: parsed.name ?? undefined,
            animated: parsed.animated ?? undefined,
        };
    }
    return { id: input };
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("steal")
        .setDescription(
            "Steals emotes, stickers, or soundboards from another server",
        )
        .addStringOption((option) =>
            option
                .setName("id")
                .setDescription("A message, emote, sticker, or sound effect ID")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("set new emoji name")
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
                content: "This command must be used in a server",
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const parsed = parseEmojiInput(rawInput);
        const id = parsed.id;

        const emojiData = await fetchEmojiUrl(id);
        if (emojiData) {
            try {
                const finalName = (
                    providedName ??
                    parsed.name ??
                    "stolen_emoji"
                ).trim();
                const added = await guild.emojis.create({
                    attachment: emojiData.url,
                    name: finalName,
                });
                const embed = new EmbedBuilder()
                    .setTitle(
                        `${emojiData.animated ? "Animated " : ""}Emoji Added`,
                    )
                    .setDescription(
                        `Added ${added.toString()} (\`${added.name}\`) to the server`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("Failed to add emoji", err);
                return interaction.editReply({
                    content: "Failed to add emoji",
                });
            }
        }

        const stickerData = await fetchStickerAttachment(id);
        if (stickerData) {
            try {
                const finalName = (providedName ?? "stolen_sticker").trim();
                const added = await guild.stickers.create({
                    file: stickerData.attachment,
                    name: finalName,
                    tags: finalName,
                });
                const embed = new EmbedBuilder()
                    .setTitle("Sticker Added")
                    .setDescription(
                        `Added sticker **${added.name}** to the server`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("Failed to add sticker", err);
                return interaction.editReply({
                    content: "Failed to add sticker",
                });
            }
        }

        const soundCdnUrl = `https://cdn.discordapp.com/soundboard-sounds/${id}`;
        const soundRes = await fetch(soundCdnUrl);
        if (soundRes.ok) {
            const buffer = Buffer.from(await soundRes.arrayBuffer());
            const contentType =
                soundRes.headers.get("content-type") ?? undefined;

            let originalName: string | undefined;
            try {
                const defaultSounds = (await guild.client.rest.get(
                    `/soundboard-default-sounds`,
                )) as Array<{ sound_id: string; name: string }>;
                originalName = defaultSounds?.find(
                    (s) => s.sound_id === id,
                )?.name;
            } catch (err) {
                console.warn("Default soundboard lookup failed ", err);
            }

            try {
                const finalName = (
                    providedName ??
                    originalName ??
                    "stolen_sound"
                ).trim();
                const added = await guild.soundboardSounds.create({
                    file: buffer,
                    name: finalName,
                    contentType,
                });
                const embed = new EmbedBuilder()
                    .setTitle("Sound Added!")
                    .setDescription(
                        `Added soundboard sound **${added.name ?? finalName}** to this server`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("Failed to add sound", err);
                return interaction.editReply({
                    content: "Failed to add sound",
                });
            }
        }

        const channels = guild.channels.cache.filter((c) => c.isTextBased());

        for (const [, channel] of channels) {
            if (!channel.isTextBased()) continue;
            let message;
            try {
                message = await channel.messages.fetch(id);
            } catch (err) {
                if (
                    err instanceof DiscordAPIError &&
                    err.code === RESTJSONErrorCodes.UnknownMessage
                ) {
                    continue;
                }
                console.warn(
                    `unexpected error fetching message ${id} in #${channel.name}:`,
                    err,
                );
                continue;
            }

            try {
                const sticker = message.stickers.first();
                if (sticker) {
                    if (sticker.format === StickerFormatType.Lottie) {
                        return interaction.editReply({
                            content: "Lottie stickers can't be re-uploaded",
                        });
                    }
                    // TODO: support animated (APNG) sticker stealing
                    if (sticker.format === StickerFormatType.APNG) {
                        return interaction.editReply({
                            content: "Animated stickers aren't supported yet",
                        });
                    }
                    let stickerRes: Response | null = null;
                    let stickerExt: "gif" | "png" = "gif";
                    for (const tryExt of ["gif", "png"] as const) {
                        const res = await fetch(
                            `https://cdn.discordapp.com/stickers/${sticker.id}.${tryExt}?size=320`,
                        );
                        if (res.ok) {
                            stickerRes = res;
                            stickerExt = tryExt;
                            break;
                        }
                    }
                    if (!stickerRes) throw new Error("Could not fetch sticker");
                    const finalName = (providedName ?? sticker.name).trim();
                    const added = await guild.stickers.create({
                        file: {
                            attachment: Buffer.from(
                                await stickerRes.arrayBuffer(),
                            ),
                            name: `sticker.${stickerExt}`,
                        },
                        name: finalName,
                        tags: sticker.tags ?? finalName,
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Sticker Added")
                        .setDescription(
                            `Stole sticker **${added.name}** from message`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

                const emojiRaw = message.content.match(/<a?:\w+:\d+>/)?.[0];
                const emojiParsed = emojiRaw ? parseEmoji(emojiRaw) : null;
                if (emojiParsed?.id) {
                    const ext = emojiParsed.animated ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/emojis/${emojiParsed.id}.${ext}?size=128`;
                    const finalName = (
                        providedName ??
                        emojiParsed.name ??
                        "stolen_emoji"
                    ).trim();
                    const added = await guild.emojis.create({
                        attachment: url,
                        name: finalName,
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Emoji Added")
                        .setDescription(
                            `Stole ${added.toString()} (\`${added.name}\`) from message`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }
                break;
            } catch (err) {
                console.error("Failed to steal from message", err);
                return interaction.editReply({
                    content: "Failed to steal from message",
                });
            }
        }

        return interaction.editReply({
            content: "Nothing stealable",
        });
    },
};

export default command;
