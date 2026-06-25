import {
    ApplicationCommandOptionType,
    InteractionContextType,
    PermissionFlagsBits,
    PermissionsBitField,
} from "discord.js";
import { search } from "fast-fuzzy";
import type { CommandHelpMetadata, SlashCommand } from "../types.d.ts";

interface SerializedChoice {
    name?: unknown;
    value?: unknown;
}

interface SerializedOption {
    type?: unknown;
    name?: unknown;
    description?: unknown;
    required?: unknown;
    autocomplete?: unknown;
    choices?: unknown;
    options?: unknown;
}

interface SerializedCommand {
    type?: unknown;
    name?: unknown;
    description?: unknown;
    options?: unknown;
    contexts?: unknown;
    dm_permission?: unknown;
    default_member_permissions?: unknown;
}

export interface HelpOption {
    type: number;
    name: string;
    description: string;
    required: boolean;
    autocomplete: boolean;
    choices: Array<{ name: string; value: string | number }>;
    options: HelpOption[];
}

export interface HelpEntry {
    name: string;
    description: string;
    commandId?: string;
    options: HelpOption[];
    contexts?: number[];
    defaultMemberPermissions?: bigint;
    help: CommandHelpMetadata;
}

export interface GeneralHelpSection {
    title: string;
    lines: string[];
}

type CommandSource = Pick<SlashCommand, "data" | "help">;

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeChoices(value: unknown): HelpOption["choices"] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((raw): HelpOption["choices"] => {
        if (!raw || typeof raw !== "object") return [];
        const choice = raw as SerializedChoice;
        const name = asString(choice.name);
        if (!name || (typeof choice.value !== "string" && typeof choice.value !== "number")) {
            return [];
        }
        return [{ name, value: choice.value }];
    });
}

function normalizeOptions(value: unknown): HelpOption[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((raw): HelpOption[] => {
        if (!raw || typeof raw !== "object") return [];
        const option = raw as SerializedOption;
        const name = asString(option.name);
        if (!name || typeof option.type !== "number") return [];

        return [
            {
                type: option.type,
                name,
                description: asString(option.description) ?? "No description provided.",
                required: option.required === true,
                autocomplete: option.autocomplete === true,
                choices: normalizeChoices(option.choices),
                options: normalizeOptions(option.options),
            },
        ];
    });
}

export function extractHelpEntry(source: CommandSource): HelpEntry | null {
    let serialized: SerializedCommand;
    try {
        serialized = source.data.toJSON() as SerializedCommand;
    } catch {
        return null;
    }

    const name = asString(serialized.name) ?? asString(source.data.name);
    if (!name) return null;

    const contexts = Array.isArray(serialized.contexts)
        ? serialized.contexts.filter((context): context is number => typeof context === "number")
        : serialized.dm_permission === false
          ? [InteractionContextType.Guild]
          : undefined;

    let defaultMemberPermissions: bigint | undefined;
    if (
        typeof serialized.default_member_permissions === "string" &&
        /^\d+$/.test(serialized.default_member_permissions)
    ) {
        defaultMemberPermissions = BigInt(serialized.default_member_permissions);
    }

    return {
        name,
        description: asString(serialized.description) ?? "No description provided.",
        options: normalizeOptions(serialized.options),
        contexts,
        defaultMemberPermissions,
        help: source.help ?? {},
    };
}

export function collectHelpEntries(slashCommands: {
    values(): IterableIterator<SlashCommand>;
}): HelpEntry[] {
    const entries: HelpEntry[] = [];
    for (const command of slashCommands.values()) {
        const entry = extractHelpEntry(command);
        if (entry) entries.push(entry);
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function isGuildOnly(entry: HelpEntry): boolean {
    return (
        entry.contexts?.includes(InteractionContextType.Guild) === true &&
        !entry.contexts.some((context) => context !== InteractionContextType.Guild)
    );
}

export function isAdminOnly(entry: HelpEntry): boolean {
    return (
        entry.defaultMemberPermissions !== undefined &&
        new PermissionsBitField(entry.defaultMemberPermissions).has(
            PermissionFlagsBits.Administrator,
            false,
        )
    );
}

export function attachCommandIds(
    entries: HelpEntry[],
    commandIds: ReadonlyMap<string, string>,
): HelpEntry[] {
    return entries.map((entry) => ({
        ...entry,
        commandId: commandIds.get(entry.name),
    }));
}

export function formatCommandReference(entry: HelpEntry, path: string[] = []): string {
    const qualifiedName = [entry.name, ...path].join(" ");
    return entry.commandId ? `</${qualifiedName}:${entry.commandId}>` : `\`${qualifiedName}\``;
}

export function formatPermissionNames(permissions: bigint): string {
    const names = new PermissionsBitField(permissions).toArray();
    if (names.length === 0) return "no permissions";
    return names.map((name) => name.replace(/([a-z])([A-Z])/g, "$1 $2")).join(", ");
}

export function buildGeneralHelpSections(entries: HelpEntry[]): GeneralHelpSection[] {
    const sections = new Map<string, string[]>();

    for (const entry of entries) {
        if (entry.help.hidden) continue;
        const title = entry.help.category ?? "";
        const adminLabel = isAdminOnly(entry) ? " — **Admin only**" : "";
        const line = `**/${entry.name}** — ${entry.description}${adminLabel}`;
        const lines = sections.get(title) ?? [];
        lines.push(line);
        sections.set(title, lines);
    }

    return [...sections.entries()]
        .sort(([a], [b]) => {
            if (a === b) return 0;
            if (a === "") return -1;
            if (b === "") return 1;
            return a.localeCompare(b);
        })
        .map(([title, lines]) => ({ title, lines }));
}

export function findHelpEntry(entries: HelpEntry[], query: string): HelpEntry | undefined {
    const normalized = query.trim().replace(/^\//, "").toLocaleLowerCase();
    return entries.find(
        (entry) =>
            entry.name.toLocaleLowerCase() === normalized ||
            entry.help.aliases?.some((alias) => alias.toLocaleLowerCase() === normalized),
    );
}

export function suggestHelpEntries(entries: HelpEntry[], query: string, limit = 3): string[] {
    const visible = entries.filter((entry) => !entry.help.hidden);
    const names = visible.flatMap((entry) => [entry.name, ...(entry.help.aliases ?? [])]);
    if (names.length === 0 || query.trim().length === 0) return [];
    return [...new Set(search(query, names))].slice(0, limit);
}

function optionToken(option: HelpOption): string {
    return option.required ? `<${option.name}>` : `[${option.name}]`;
}

function collectUsageLines(entry: HelpEntry, options: HelpOption[], path: string[] = []): string[] {
    const branches = options.filter(
        (option) =>
            option.type === ApplicationCommandOptionType.Subcommand ||
            option.type === ApplicationCommandOptionType.SubcommandGroup,
    );
    const arguments_ = options.filter(
        (option) =>
            option.type !== ApplicationCommandOptionType.Subcommand &&
            option.type !== ApplicationCommandOptionType.SubcommandGroup,
    );

    if (branches.length === 0) {
        const suffix = arguments_.map(optionToken).join(" ");
        const reference = formatCommandReference(entry, path);
        return [`${reference}${suffix ? ` ${suffix}` : ""}`];
    }

    return branches.flatMap((branch) =>
        collectUsageLines(entry, branch.options, [...path, branch.name]),
    );
}

export function formatUsage(entry: HelpEntry): string[] {
    if (entry.help.usage) return [entry.help.usage];
    return collectUsageLines(entry, entry.options);
}

function flattenOptions(options: HelpOption[], path: string[] = []): string[] {
    return options.flatMap((option) => {
        if (
            option.type === ApplicationCommandOptionType.Subcommand ||
            option.type === ApplicationCommandOptionType.SubcommandGroup
        ) {
            return [
                `**${[...path, option.name].join(" ")}** — ${option.description}`,
                ...flattenOptions(option.options, [...path, option.name]),
            ];
        }

        const choiceSummary = summarizeChoices(option.choices);
        const qualifiers = [
            option.required ? "required" : "optional",
            choiceSummary ? `choices: ${choiceSummary}` : undefined,
        ].filter(Boolean);
        return [
            `\`${[...path, option.name].join(" ")}\` (${qualifiers.join(", ")}) — ${option.description}`,
        ];
    });
}

function summarizeChoices(choices: HelpOption["choices"], limit = 300): string | undefined {
    if (choices.length === 0) return undefined;

    const shown: string[] = [];
    for (const choice of choices) {
        const remaining = choices.length - shown.length - 1;
        const suffix = remaining > 0 ? `, and ${remaining} more` : "";
        const candidate = [...shown, choice.name].join(", ") + suffix;
        if (candidate.length > limit && shown.length > 0) break;
        shown.push(choice.name);
    }

    const hiddenCount = choices.length - shown.length;
    return `${shown.join(", ")}${hiddenCount > 0 ? `, and ${hiddenCount} more` : ""}`;
}

export function formatOptionDetails(entry: HelpEntry): string[] {
    return flattenOptions(entry.options);
}
