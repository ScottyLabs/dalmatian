import {
    APIEmbedField,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { search } from "fast-fuzzy";
import diningLocationData from "../data/diningLocationData.json" with {
    type: "json",
};
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";

/** Represents a dining location returned from the CMUEats API */
interface Location {
    name: string;
    locAliases?: string[];
    shortDescription: string;
    description: string;
    url: string;
    menu?: string;
    location: string;
    coordinateLat: number;
    coordinateLng: number;
    acceptsOnlineOrders: boolean;
    times: {
        start: number;
        end: number;
    }[];
    conceptID: number;
    todaysSoups: string[];
    todaysSpecials: string[];
}

// Build a lookup map from location name -> list of aliases (e.g. "UC" for "University Center")
// Used to augment API data with local alias data for fuzzy building search
let locationToAliases: Record<string, string[]> = {};
for (const item of diningLocationData) {
    locationToAliases[item.name] = item.aliases;
}

/**
 * Fetches all dining locations from the CMUEats API and enriches them
 * with local alias data for building name matching.
 */
function getLocations(): Promise<Location[]> {
    const request: Request = new Request(
        "https://api.cmueats.com/v2/locations",
        {
            method: "GET",
        },
    );

    return fetch(request)
        .then((res) => res.json() as Promise<Location[]>)
        .then((data) => {
            for (let i = 0; i < data.length; i++) {
                const locName = data[i]!.location.split(",")[0]!.trim();
                if (locationToAliases[locName]) {
                    data[i]!.locAliases = locationToAliases[locName];
                }
            }
            return data as Location[];
        });
}

/** Returns true if the location is open at the given unix timestamp (ms). */
function isOpen(location: Location, time: number): boolean {
    for (const openTime of location.times)
        if (openTime.start <= time && time <= openTime.end) return true;
    return false;
}

/** Formats a unix timestamp (ms) into a human-readable time string (e.g. "2:30 PM") in Eastern time. */
function formatTimeFromMs(ms: number): string {
    const dtf = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
    });
    return dtf.format(new Date(ms));
}

/** Formats a start/end pair into a time range string (e.g. "11:00 AM - 2:00 PM"). */
function formatTimeRange(start: number, end: number): string {
    return `${formatTimeFromMs(start)} - ${formatTimeFromMs(end)}`;
}

/** Returns the unix timestamp bounds (ms) for the start and end of the current day (local time). */
function getDayBounds(): { start: number; end: number } {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    return { start, end: start + 24 * 60 * 60 * 1000 };
}

/** Filters a location's open times to only those overlapping with today, clamped to day boundaries. */
function getTimesForDay(location: Location): { start: number; end: number }[] {
    const { start: dayStart, end: dayEnd } = getDayBounds();
    return location.times
        .filter((t) => t.end > dayStart && t.start < dayEnd)
        .map((t) => ({
            start: Math.max(t.start, dayStart),
            end: Math.min(t.end, dayEnd),
        }));
}

/**
 * Returns a human-readable string of today's hours for a location.
 * Handles edge cases: "Closed today", "Open all day", or comma-separated time ranges.
 */
function getTodaysHours(location: Location): string {
    const todaysTimes = getTimesForDay(location);
    if (todaysTimes.length === 0) return "Closed today";

    const total = todaysTimes.reduce((acc, t) => acc + (t.end - t.start), 0);
    const dayLength = 24 * 60 * 60 * 1000;
    if (total >= dayLength) return "Open all day";

    return todaysTimes
        .map((time) => formatTimeRange(time.start, time.end))
        .join(", ");
}

/** Calculates the number of whole minutes between two unix timestamps (ms). */
function getMinutesBetween(from: number, to: number): number {
    return Math.floor((to - from) / 60000);
}

/**
 * Determines the current status of a location and returns an emoji + message.
 * Statuses: Open, Closing in X mins (<=60 min warning), Opening in X mins (<=60 min), or Closed.
 */
function getCurrentStatus(location: Location): {
    emoji: string;
    message: string;
} {
    const now = Date.now();
    const currentlyOpen = isOpen(location, now);

    if (currentlyOpen) {
        const openNow = location.times.find(
            (time) => time.start <= now && now <= time.end,
        );
        if (openNow) {
            const minutesUntilClose = getMinutesBetween(now, openNow.end);
            if (minutesUntilClose <= 60 && minutesUntilClose > 0) {
                return {
                    emoji: ":warning:",
                    message: `Closing in ${minutesUntilClose} mins`,
                };
            }
            return { emoji: ":green_circle:", message: "Open" };
        }
    }

    const todaysTimes = getTimesForDay(location);
    for (const time of todaysTimes) {
        const minutesUntilOpen = getMinutesBetween(now, time.start);
        if (minutesUntilOpen > 0 && minutesUntilOpen <= 60) {
            return {
                emoji: ":bell:",
                message: `Opening in ${minutesUntilOpen} mins`,
            };
        }
    }
    return { emoji: ":no_entry:", message: "Closed" };
}

/** Formats a location's title with its status emoji and message, truncated to 256 chars (Discord embed limit). */
function formatLocationTitle(location: Location): string {
    const status = getCurrentStatus(location);
    const title = `${status.emoji} ${location.name} (${status.message})`;
    // prevent exceeding the 256 char limit
    return title.slice(0, 256);
}

/**
 * Creates a detailed Discord embed for a single location, including description,
 * hours, online order availability, and a Google Maps static image.
 */
function formatLocationEmbed(location: Location): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(formatLocationTitle(location))
        .setDescription(location.description)
        .addFields(
            { name: "Location", value: location.location, inline: true },
            {
                name: "Today's Hours",
                value: getTodaysHours(location),
                inline: true,
            },
            {
                name: "Accepts Online Orders",
                value: location.acceptsOnlineOrders ? "Yes" : "No",
                inline: true,
            },
        )
        .setURL(location.url);

    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${location.coordinateLat},${location.coordinateLng}&zoom=17&size=400x200&markers=color:red%7C${location.coordinateLat},${location.coordinateLng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    embed.setImage(mapUrl);

    return embed;
}

/** Creates a compact embed field for a location (used in multi-location list views). */
function formatLocationField(location: Location): APIEmbedField {
    const todaysHours = getTodaysHours(location);
    return {
        name: formatLocationTitle(location),
        value: `${location.location} • ${todaysHours}`,
    };
}

/**
 * Formats a list of locations into paginated embeds. If a single location is provided,
 * returns a detailed embed. Otherwise, returns pages of compact field entries.
 * Verbose mode allows up to 25 locations per page; normal mode allows 10.
 * Enforces Discord's 6000-char embed limit.
 */
function formatLocations(
    locations: Location[],
    verbose: boolean,
): EmbedBuilder[] {
    if (locations.length === 0) {
        return [
            new EmbedBuilder().setDescription(
                "No dining locations found matching your query.",
            ),
        ];
    }

    if (locations.length == 1) {
        return [formatLocationEmbed(locations[0]!)];
    }

    const embeds: EmbedBuilder[] = [];
    let currentEmbed = new EmbedBuilder().setTitle(
        `${locations.length} Dining Locations Found`,
    );

    const maxPerPage = verbose ? 25 : 10;
    let charCount = currentEmbed.data.title!.length;

    for (const location of locations) {
        if ((currentEmbed.data.fields?.length ?? 0) >= maxPerPage) {
            embeds.push(currentEmbed);
            currentEmbed = new EmbedBuilder().setTitle(
                `${locations.length} Dining Locations Found`,
            );
            charCount += currentEmbed.data.title!.length;
        }
        const field = formatLocationField(location);
        charCount += field.name.length + field.value.length;
        currentEmbed.addFields(field);
    }

    if (charCount > 6000) {
        return [new EmbedBuilder().setTitle("Error: Character count exceeded")];
    }

    embeds.push(currentEmbed);
    return embeds;
}

/**
 * /dining slash command with subcommands:
 *   - all: Lists all dining locations alphabetically (paginated)
 *   - all-verbose: Same as "all" but shows all pages at once with 25 items/page
 *   - open: Lists only currently open locations (paginated)
 *   - open-verbose: Same as "open" but shows all pages at once
 *   - search: Fuzzy search by name and/or building (with autocomplete support)
 */
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("dining")
        .setDescription("Show on-campus dining locations & hours")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("all")
                .setDescription("Show all dining locations"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("all-verbose")
                .setDescription(
                    "Show all dining locations (all pages at once)",
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("open")
                .setDescription("Show currently open dining locations"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("open-verbose")
                .setDescription(
                    "Show currently open dining locations (all pages at once)",
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("search")
                .setDescription("Search for a specific dining location")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("Search by name for dining locations")
                        .setRequired(false)
                        .setAutocomplete(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("building")
                        .setDescription(
                            "Search by building for dining locations",
                        )
                        .setRequired(false)
                        .setAutocomplete(true),
                ),
        ),
    async execute(interaction) {
        const locations = await getLocations();
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "all" || subcommand == "all-verbose") {
            const embeds = formatLocations(
                locations.sort((a, b) => a.name.localeCompare(b.name)),
                subcommand == "all-verbose",
            );
            return new EmbedPaginator(embeds, subcommand == "all-verbose").send(
                interaction,
            );
        }

        if (subcommand === "open" || subcommand == "open-verbose") {
            const openLocations = locations.filter((loc) =>
                isOpen(loc, Date.now()),
            );
            const embeds = formatLocations(
                openLocations.sort((a, b) => a.name.localeCompare(b.name)),
                subcommand == "open-verbose",
            );
            return new EmbedPaginator(
                embeds,
                subcommand == "open-verbose",
            ).send(interaction);
        }

        if (subcommand === "search") {
            const query =
                interaction.options.getString("name")?.toLowerCase() ?? null;
            const building =
                interaction.options.getString("building")?.toLowerCase() ??
                null;

            if (!building && !query) {
                return interaction.reply({
                    content: "You must provide an input",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const matchedLocations = locations.filter((location) => {
                const nameMatches = query
                    ? location.name.toLowerCase().includes(query)
                    : true;
                const buildingMatches = building
                    ? search(
                          building,
                          [location.location, ...(location.locAliases ?? [])],
                          { threshold: 0.8 },
                      ).length > 0
                    : true;
                return nameMatches && buildingMatches;
            });

            const embeds = formatLocations(
                matchedLocations.sort((a, b) => a.name.localeCompare(b.name)),
                false,
            );
            return new EmbedPaginator(embeds).send(interaction);
        }
    },

    /** Handles autocomplete for the "search" subcommand's name and building options using fuzzy matching. */
    async autocomplete(_client, interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();

        const locations = await getLocations();

        let choices: { name: string; value: string }[] = [];

        if (focusedOption.name === "name") {
            const filteredChoices =
                focusedValue === ""
                    ? locations
                    : search(focusedValue, locations, {
                          keySelector: (loc) => loc.name,
                      });
            choices = filteredChoices.slice(0, 25).map((loc) => ({
                name: loc.name,
                value: loc.name,
            }));
        } else if (focusedOption.name === "building") {
            const buildingMap = new Map<string, string>();
            locations.forEach((loc) => {
                const buildingName = loc.location.split(",")[0]!.trim();
                buildingMap.set(buildingName, buildingName);
                loc.locAliases?.forEach((alias) => {
                    buildingMap.set(alias, buildingName);
                });
            });

            const buildings = Array.from(buildingMap.keys());
            const filteredChoices =
                focusedValue === ""
                    ? buildings
                    : search(focusedValue, buildings);
            choices = filteredChoices.slice(0, 25).map((name) => ({
                name,
                value: buildingMap.get(name)!,
            }));
        }

        await interaction.respond(choices);
    },
};

export default command;
