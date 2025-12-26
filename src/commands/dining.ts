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

interface Time {
    day: number;
    hour: number;
    minute: number;
}

interface Location {
    conceptID: number;
    name: string;
    locAliases?: string[];
    shortDescription: string;
    description: string;
    url: string;
    location: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    acceptsOnlineOrders: boolean;
    times: {
        start: Time;
        end: Time;
    }[];
}

let locationToAliases: Record<string, string[]> = {};
for (const item of diningLocationData) {
    locationToAliases[item.name] = item.aliases;
}

function getLocations(): Promise<Location[]> {
    const request: Request = new Request(
        "https://dining.apis.scottylabs.org/locations",
        {
            method: "GET",
        },
    );

    return fetch(request)
        .then((res) => res.json() as Promise<{ locations: Location[] }>)
        .then((data) => {
            let newData = data.locations;
            for (let i = 0; i < newData.length; i++) {
                const locName = newData[i]!.location.split(",")[0]!.trim();
                if (locationToAliases[locName]) {
                    newData[i]!.locAliases = locationToAliases[locName];
                }
            }
            return newData as Location[];
        });
}

function isBetween(now: Time, start: Time, end: Time): boolean {
    if (start.day === now.day || end.day === now.day) {
        return (
            (start.hour < now.hour && now.hour < end.hour) ||
            (start.hour === now.hour && start.minute <= now.minute) ||
            (end.hour === now.hour && now.minute <= end.minute)
        );
    }
    return start.day < now.day && now.day < end.day;
}

function isOpen(location: Location, time: Time): boolean {
    for (const openTime of location.times)
        if (
            isBetween(time, openTime.start, openTime.end) &&
            openTime.start.day == time.day
        )
            return true;
    return false;
}

function getCurrentTime(): Time {
    return {
        day: new Date().getDay(),
        hour: new Date().getHours(),
        minute: new Date().getMinutes(),
    };
}

function format12Hour(hour: number, minute: number): string {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const m = minute < 10 ? `0${minute}` : minute;
    return `${h}:${m} ${period}`;
}

function formatTimeRange(start: Time, end: Time): string {
    return `${format12Hour(start.hour, start.minute)} - ${format12Hour(end.hour, end.minute)}`;
}

function getTodaysHours(location: Location, now: Time): string {
    const todaysTimes = location.times.filter(
        (time) => time.start.day === now.day,
    );
    return todaysTimes.length > 0
        ? todaysTimes
              .map((time) => formatTimeRange(time.start, time.end))
              .join(", ")
        : "Closed today";
}

function timeToMinutes(time: Time): number {
    return time.day * 24 * 60 + time.hour * 60 + time.minute;
}

function getMinutesBetween(from: Time, to: Time): number {
    return timeToMinutes(to) - timeToMinutes(from);
}

function getCurrentStatus(
    location: Location,
    now: Time,
): { emoji: string; message: string } {
    const currentlyOpen = isOpen(location, now);

    if (currentlyOpen) {
        const openNow = location.times.find(
            (time) =>
                time.start.day === now.day &&
                isBetween(now, time.start, time.end),
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

    const todaysTimes = location.times.filter(
        (time) => time.start.day === now.day,
    );
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

function formatLocationTitle(location: Location, now: Time): string {
    const status = getCurrentStatus(location, now);
    const title = `${status.emoji} ${location.name} (${status.message})`;
    // prevent exceeding the 256 char limit
    return title.slice(0, 256);
}

function formatLocationEmbed(location: Location, now: Time): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(formatLocationTitle(location, now))
        .setDescription(location.description)
        .addFields(
            { name: "Location", value: location.location, inline: true },
            {
                name: "Today's Hours",
                value: getTodaysHours(location, now),
                inline: true,
            },
            {
                name: "Accepts Online Orders",
                value: location.acceptsOnlineOrders ? "Yes" : "No",
                inline: true,
            },
        )
        .setURL(location.url);

    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${location.coordinates.lat},${location.coordinates.lng}&zoom=17&size=400x200&markers=color:red%7C${location.coordinates.lat},${location.coordinates.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    embed.setImage(mapUrl);

    return embed;
}

function formatLocationField(location: Location, now: Time): APIEmbedField {
    const todaysHours = getTodaysHours(location, now);
    return {
        name: formatLocationTitle(location, now),
        value: `${location.location} • ${todaysHours}`,
    };
}

function formatLocations(locations: Location[]): EmbedBuilder[] {
    if (locations.length === 0) {
        return [
            new EmbedBuilder()
                .setTitle("Dining Locations")
                .setDescription("No open dining locations found."),
        ];
    }

    if (locations.length == 1) {
        const now = getCurrentTime();
        return [formatLocationEmbed(locations[0]!, now)];
    }

    const now = getCurrentTime();
    const embeds: EmbedBuilder[] = [];
    let currentEmbed = new EmbedBuilder().setTitle("Dining Locations");

    for (const location of locations) {
        if ((currentEmbed.data.fields?.length ?? 0) >= 6) {
            embeds.push(currentEmbed);
            currentEmbed = new EmbedBuilder().setTitle("Dining Locations");
        }
        const field = formatLocationField(location, now);
        currentEmbed.addFields(field);
    }

    embeds.push(currentEmbed);
    return embeds;
}

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
                .setName("open")
                .setDescription("Show currently open dining locations"),
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

        if (subcommand === "all") {
            const embeds = formatLocations(
                locations.sort((a, b) => a.name.localeCompare(b.name)),
            );
            return new EmbedPaginator(embeds).send(interaction);
        }

        if (subcommand === "open") {
            const now = getCurrentTime();
            const openLocations = locations.filter((loc) => isOpen(loc, now));
            const embeds = formatLocations(
                openLocations.sort((a, b) => a.name.localeCompare(b.name)),
            );
            return new EmbedPaginator(embeds).send(interaction);
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
                    ? search(building, [
                          location.location,
                          ...(location.locAliases ?? []),
                      ]).length > 0
                    : true;
                return nameMatches && buildingMatches;
            });

            if (matchedLocations.length == 0) {
                return interaction.reply({
                    content: "No location found",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embeds = formatLocations(
                matchedLocations.sort((a, b) => a.name.localeCompare(b.name)),
            );
            return new EmbedPaginator(embeds).send(interaction);
        }
    },

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
