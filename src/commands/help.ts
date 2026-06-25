import {
    ApplicationCommandType,
    type Client,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { search } from "fast-fuzzy";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import {
    attachCommandIds,
    buildGeneralHelpSections,
    collectHelpEntries,
    findHelpEntry,
    formatOptionDetails,
    formatPermissionNames,
    formatUsage,
    isAdminOnly,
    isGuildOnly,
    suggestHelpEntries,
    type GeneralHelpSection,
    type HelpEntry,
} from "../utils/help.ts";

const EMBED_DESCRIPTION_LIMIT = 4_096;
const EMBED_FIELD_LIMIT = 1_024;
const EMBED_TEXT_LIMIT = 5_000;

async function addRegisteredCommandIds(entries: HelpEntry[], client: Client): Promise<HelpEntry[]> {
    try {
        const registeredCommands = await client.application?.commands.fetch();
        if (!registeredCommands) return entries;

        const commandIds = new Map(
            registeredCommands
                .filter((command) => command.type === ApplicationCommandType.ChatInput)
                .map((command) => [command.name, command.id]),
        );
        return attachCommandIds(entries, commandIds);
    } catch {
        return entries;
    }
}

function appendBlock(content: string, block: string): string {
    return content ? `${content}\n${block}` : block;
}

export function generalHelpEmbeds(sections: GeneralHelpSection[]): EmbedBuilder[] {
    if (sections.every((section) => section.lines.length === 0)) {
        return [
            new EmbedBuilder()
                .setTitle("Help")
                .setDescription("No commands are currently available."),
        ];
    }

    const introduction =
        "Browse the commands below. For details, use `/help` and choose a command.";
    const pageDescriptions: string[] = [];
    let current = `${introduction}\n`;

    for (const section of sections) {
        const heading = section.title ? `### ${section.title}` : "";
        let needsHeading = heading.length > 0;

        for (const line of section.lines) {
            const block = needsHeading ? `${heading}\n${line}` : line;
            if (appendBlock(current, block).length > EMBED_DESCRIPTION_LIMIT) {
                pageDescriptions.push(current);
                current = heading ? `${heading}\n${line}` : line;
            } else {
                current = appendBlock(current, block);
            }
            needsHeading = false;
        }
    }
    if (current) pageDescriptions.push(current);

    return pageDescriptions.map((description) =>
        new EmbedBuilder().setTitle("Help").setDescription(description),
    );
}

interface HelpField {
    name: string;
    value: string;
}

function packLinesIntoFields(name: string, lines: string[]): HelpField[] {
    const fields: HelpField[] = [];
    let value = "";

    for (const originalLine of lines) {
        const line =
            originalLine.length > EMBED_FIELD_LIMIT
                ? `${originalLine.slice(0, EMBED_FIELD_LIMIT - 1)}…`
                : originalLine;
        if (value && appendBlock(value, line).length > EMBED_FIELD_LIMIT) {
            fields.push({ name, value });
            value = line;
        } else {
            value = appendBlock(value, line);
        }
    }
    if (value) fields.push({ name, value });
    return fields;
}

export function detailedHelpEmbeds(entry: HelpEntry): EmbedBuilder[] {
    const fields: HelpField[] = [
        ...packLinesIntoFields("Usage", formatUsage(entry)),
        ...packLinesIntoFields("Options", formatOptionDetails(entry)),
    ];

    if (entry.help.aliases?.length) {
        fields.push({
            name: "Aliases",
            value: entry.help.aliases.map((alias) => `\`${alias}\``).join(", "),
        });
    }
    if (entry.help.category) fields.push({ name: "Category", value: entry.help.category });
    if (entry.help.cooldown !== undefined) {
        fields.push({ name: "Cooldown", value: String(entry.help.cooldown) });
    }
    if (isAdminOnly(entry)) {
        fields.push({ name: "Access", value: "Admin only" });
    } else if (entry.defaultMemberPermissions !== undefined) {
        fields.push({
            name: "Required permission",
            value: formatPermissionNames(entry.defaultMemberPermissions),
        });
    }
    if (isGuildOnly(entry)) fields.push({ name: "Availability", value: "Server only" });

    const fieldPages: HelpField[][] = [];
    let currentFields: HelpField[] = [];
    let currentLength = entry.description.length;

    for (const field of fields) {
        const repeatsSemanticField =
            (field.name === "Usage" || field.name === "Options") &&
            currentFields.some((currentField) => currentField.name === field.name);
        const fieldLength = field.name.length + field.value.length;
        if (
            currentFields.length >= 25 ||
            currentLength + fieldLength > EMBED_TEXT_LIMIT ||
            repeatsSemanticField
        ) {
            fieldPages.push(currentFields);
            currentFields = [];
            currentLength = entry.description.length;
        }
        currentFields.push(field);
        currentLength += fieldLength;
    }
    if (currentFields.length > 0 || fieldPages.length === 0) fieldPages.push(currentFields);

    return fieldPages.map((pageFields) => {
        const embed = new EmbedBuilder()
            .setTitle(entry.name)
            .setDescription(entry.description.slice(0, EMBED_DESCRIPTION_LIMIT));
        if (pageFields.length > 0) embed.addFields(pageFields);
        return embed;
    });
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("List commands or show help for a specific command")
        .addStringOption((option) =>
            option
                .setName("command")
                .setDescription("Command to show detailed help for")
                .setAutocomplete(true)
                .setRequired(false),
        ),

    async execute(interaction) {
        const entries = collectHelpEntries(interaction.client.slashCommands);
        const query = interaction.options.getString("command")?.trim();

        if (!query) {
            const sections = buildGeneralHelpSections(entries);
            await new EmbedPaginator({
                pages: generalHelpEmbeds(sections),
            }).send(interaction);
            return;
        }

        const entry = findHelpEntry(entries, query);
        if (!entry) {
            const suggestions = suggestHelpEntries(entries, query);
            const suggestionText = suggestions.length
                ? ` Did you mean ${suggestions.map((name) => `\`${name}\``).join(", ")}?`
                : "";
            await interaction.reply({
                content: `No command named \`${query}\` was found.${suggestionText}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply();
        const [entryWithId] = await addRegisteredCommandIds([entry], interaction.client);
        await new EmbedPaginator({
            pages: detailedHelpEmbeds(entryWithId ?? entry),
        }).send(interaction);
    },

    async autocomplete(_client, interaction) {
        const entries = collectHelpEntries(interaction.client.slashCommands).filter(
            (entry) => !entry.help.hidden,
        );
        const focused = interaction.options.getFocused().trim();
        const names = entries.map((entry) => entry.name);
        const matches = focused ? search(focused, names) : names;
        await interaction.respond(
            matches.slice(0, 25).map((name) => {
                const entry = entries.find((candidate) => candidate.name === name)!;
                return {
                    name: entry.name.slice(0, 100),
                    value: entry.name.slice(0, 100),
                };
            }),
        );
    },
};

export default command;
