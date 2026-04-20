import {
    DiscordAPIError,
    EmbedBuilder,
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
            "Steals emotes, stickers, or soundboards from another server",
        )
        .addStringOption((option) =>
            option
                .setName("id")
                .setDescription(
                    "A message, emote, sticker, or sound effect ID",
                )
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription(
                    "set new emoji name",
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
                const finalName = sanitizeName(
                    providedName ?? parsed.name ?? "stolen emoji",
                );
                const added = await guild.emojis.create({
                    attachment: emojiData.url,
                    name: finalName,
                });
                const embed = new EmbedBuilder()
                    .setTitle(
                        `${emojiData.animated ? "Animated " : ""}Emoji Added`,
                    )
                    .setDescription(
                        `Added ${added} (\`${added.name}\`) to the server.`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                return interaction.editReply({
                    content: `Found the emoji but caused ${err}`,
                });
            }
        }

        const stickerData = await fetchStickerUrl(id);
        if (stickerData) {
            try {
                const finalName = sanitizeName(providedName ?? "stolen sticker");
                const added = await guild.stickers.create({
                    file: stickerData.url,
                    name: finalName,
                    tags: "grinning",
                });
                const embed = new EmbedBuilder()
                    .setTitle("Sticker Added")
                    .setDescription(
                        `Added sticker **${added.name}** to the server`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                return interaction.editReply({
                    content: `Found the sticker but caused ${err}…`,
                });
            }
        }

        let sound: { sound_id: string; name: string } | undefined;
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
            sound = allSounds.find((s) => s.sound_id === id);
        } catch (err) {
            console.warn("soundboard lookup failed skipping…", err);
        }

        if (sound) {
            try {
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
                    .setTitle("Sound Added")
                    .setDescription(
                        `Added soundboard sound **${sound.name}** to this server.`,
                    );
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                return interaction.editReply({
                    content: `found the sound but caused ${err}…`,
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
                    const ext =
                        sticker.format === StickerFormatType.GIF ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}?size=320`;
                    const finalName = sanitizeName(
                        providedName ?? sticker.name,
                    );
                    const added = await guild.stickers.create({
                        file: url,
                        name: finalName,
                        tags: sticker.tags ?? "",
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Sticker Added")
                        .setDescription(
                            `Stole sticker **${added.name}** from message`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

                const emojiMatch = message.content.match(/<(a?):(\w+):(\d+)>/);
                if (emojiMatch) {
                    const [, animated, emojiName, emojiId] = emojiMatch;
                    const ext = animated ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128`;
                    const finalName = sanitizeName(
                        providedName ?? emojiName ?? "stolen emoji",
                    );

                    const added = await guild.emojis.create({
                        attachment: url,
                        name: finalName,
                    });
                    const embed = new EmbedBuilder()
                        .setTitle("Emoji Added")
                        .setDescription(
                            `Stole ${added} (\`${added.name}\`) from message`,
                        );
                    return interaction.editReply({ embeds: [embed] });
                }
                break;
            } catch (err) {
                return interaction.editReply({
                    content: `Found the message but caused ${err}…`,
                });
            }
        }

        return interaction.editReply({
            content:
                "Could not find a valid item ID",
        });
    },
};

export default command;
