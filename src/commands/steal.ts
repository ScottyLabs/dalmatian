import {
    Client,
    DiscordAPIError,
    EmbedBuilder,
    parseEmoji,
    RESTJSONErrorCodes,
    SlashCommandBuilder,
    StickerFormatType,
    PartialEmoji,
    GuildMember,
    PermissionsBitField,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";
import { logger, nodeError } from "../utils/log.ts";

async function fetchEmojiData(
    emojiId: string,
    client: Client,
): Promise<{ url: string; animated: boolean; name?: string } | null> {
    const gifUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif?size=128`;
    const pngUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png?size=128`;

    let name: string | undefined;

    for (const [, guild] of client.guilds.cache) {
        const emoji = guild.emojis.cache.get(emojiId);
        if (emoji) {
            name = emoji.name ?? undefined;
            break;
        }
    }

    if (!name) {
        try {
            const emoji = (await client.rest.get(`/emojis/${emojiId}`)) as {
                name: string;
                animated: boolean;
            };
            name = emoji.name;
        } catch {}
    }

    const gifRes = await fetch(gifUrl);
    if (gifRes.ok) return { url: gifUrl, animated: true, name };

    const pngRes = await fetch(pngUrl);
    if (pngRes.ok) return { url: pngUrl, animated: false, name };

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

async function fetchStickerName(
    stickerId: string,
    client: Client,
): Promise<string | undefined> {
    try {
        const sticker = (await client.rest.get(`/stickers/${stickerId}`)) as {
            name: string;
        };
        return sticker.name;
    } catch {
        return undefined;
    }
}

async function fetchSoundName(
    soundId: string,
    client: Client,
): Promise<string | undefined> {
    try {
        const defaults = (await client.rest.get(
            `/soundboard-default-sounds`,
        )) as Array<{ sound_id: string; name: string }>;
        const found = defaults.find((s) => s.sound_id === soundId);
        if (found) return found.name;
    } catch {}

    for (const [, guild] of client.guilds.cache) {
        try {
            const sounds = await guild.soundboardSounds.fetch();
            const found = sounds.find((s) => s.soundId === soundId);
            if (found) return found.name;
        } catch {}
    }

    return undefined;
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

function extractSnowflake(input: string | undefined): string | null {
    if (!input) return null;

    const urlMatch = input.match(/\/(\d{17,20})(?:\/?$|\?)/);
    if (urlMatch) return urlMatch[1] ?? null;

    const idMatch = input.match(/^\d{17,20}$/);
    if (idMatch) return idMatch[0];

    const emojiMatch = input.match(/:(\d{17,20})>/);
    if (emojiMatch) return emojiMatch[1] ?? null;
    return null;
}

function parseMessageLink(input: string | undefined): {
    guildId: string;
    channelId: string;
    messageId: string;
} | null {
    if (!input) return null;
    // Matches: https://(can be discord.com or discordapp.com)/channels/<guildId>/<channelId>/<messageId>
    const m = input.match(/^(?:https?:\/\/)?(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(?<guildId>(?:\d{17,20}|@me))\/(?<channelId>\d{17,20})\/(?<messageId>\d{17,20})$/i);
    if (!m || m.length < 4) return null;

    const guildId = m.groups?.['guildId'];
    const channelId = m.groups?.['channelId'];
    const messageId = m.groups?.['messageId'];
    if (!guildId || !channelId || !messageId) return null;

    return { guildId, channelId, messageId };
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
        const member = interaction.member;

        if (!guild || !(member instanceof GuildMember)) {
            return interaction.reply({
                content: "This command must be used in a server",
                ephemeral: true,
            });
        }

        const hasPerms = member.permissions.has(
            PermissionsBitField.Flags.ManageGuildExpressions,
        );

        if (!hasPerms) {
            return interaction.reply({
                content:
                    "You need the Manage Guild Expressions permission to use this command.",
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const parsed = parseEmojiInput(rawInput);
        
        const extracted = extractSnowflake(rawInput) ?? extractSnowflake(parsed.id);
        if (!extracted) {
            return interaction.editReply({
                content:
                    "Invalid ID. Please provide a valid emoji, sticker, sound, or message ID (or message URL).",
            });
        }
        const id = extracted;

        const emojiData = await fetchEmojiData(id, interaction.client);
        if (emojiData) {
            try {
                const finalName = (
                    providedName ??
                    parsed.name ??
                    emojiData.name ??
                    ""
                ).trim();
                if (!finalName) {
                    return interaction.editReply({
                        content:
                            "Couldn't find emoji name. Pass the full emoji with the `name` option.",
                    });
                }
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
                logger.error("Failed to add emoji", nodeError(err));
                return interaction.editReply({
                    content: "Failed to add emoji",
                });
            }
        }

        const stickerData = await fetchStickerAttachment(id);
        if (stickerData) {
            try {
                const fetchedName = await fetchStickerName(
                    id,
                    interaction.client,
                );
                const finalName = (
                    providedName ??
                    fetchedName ??
                    "stolen_sticker"
                ).trim();
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
                if (
                    err instanceof DiscordAPIError &&
                    err.code ===
                        RESTJSONErrorCodes.MaximumNumberOfStickersReached
                ) {
                    return interaction.editReply({
                        content:
                            "This server has reached the maximum number of stickers.",
                    });
                }
                logger.error("Failed to add sticker", nodeError(err));
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

            const originalName = await fetchSoundName(id, interaction.client);

            const finalName = (providedName ?? originalName ?? "").trim();
            if (!finalName) {
                return interaction.editReply({
                    content:
                        "Couldn't determine sound name. Please use the `name` option.",
                });
            }

            try {
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
                logger.error("Failed to add sound", nodeError(err));
                return interaction.editReply({
                    content: "Failed to add sound",
                });
            }
        }

        const channels = guild.channels.cache.filter((c) => c.isTextBased());

        for (const [, channel] of channels) {

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
                logger.warn(
                    `unexpected error fetching message ${id} in #${channel.name}:`,
                    nodeError(err),
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

                const emojis = [...message.content.matchAll(/<a?:\w+:\d+>/g)]
                    .map((match) => parseEmoji(match[0]))
                    .filter(
                        (e): e is PartialEmoji & { id: string } =>
                            e?.id != null,
                    );
                const results: string[] = [];
                for (const emoji of emojis) {
                    const ext = emoji.animated ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=128`;
                    const finalName = (providedName ?? emoji.name ?? "").trim();
                    if (!finalName) continue;
                    try {
                        const added = await guild.emojis.create({
                            attachment: url,
                            name: finalName,
                        });
                        results.push(`${added.toString()} (\`${added.name}\`)`);
                    } catch (err) {
                        if (
                            err instanceof DiscordAPIError &&
                            err.code ===
                                RESTJSONErrorCodes.MaximumNumberOfEmojisReached
                        ) {
                            return interaction.editReply({
                                content: `Reached max emojis. Successfully added: ${results.join(", ") || "none"}`,
                            });
                        }
                        logger.error("Failed to steal emoji", nodeError(err));
                    }
                }

                if (results.length === 0) {
                    return interaction.editReply({
                        content: "Failed to steal any emojis.",
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle("Emojis Added")
                    .setDescription(`Stole ${results.join(", ")} from message`);
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                logger.error("Failed to steal from message", nodeError(err));
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
