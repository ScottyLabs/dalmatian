import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { search } from "fast-fuzzy";
import diningLocationData from "../data/diningLocationData.json" with {
    type: "json",
};
import type { Command } from "../types.d.ts";

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

function format12Hour(hour: number, minute: number) {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const m = minute < 10 ? `0${minute}` : minute;
    return `${h}:${m} ${period}`;
}

function formatLocation(location: Location | undefined): EmbedBuilder {
    if (!location) {
        return new EmbedBuilder()
            .setTitle("Dining Location Not Found")
            .setDescription(
                "The specified dining location could not be found.",
            );
    }

    const now: Time = {
        day: new Date().getDay(),
        hour: new Date().getHours(),
        minute: new Date().getMinutes(),
    };

    const nowOpenTimes = location.times.filter(({ start, end }) =>
        isBetween(now, start, end),
    );

    const currentStatus =
        nowOpenTimes.length > 0
            ? nowOpenTimes
                  .filter((time) => {
                      return time.start.day == now.day && isOpen(location, now);
                  })
                  .map((time) => {
                      return `${format12Hour(time.start.hour, time.start.minute)} - ${format12Hour(time.end.hour, time.end.minute)}`;
                  })
                  .join(", ")
            : "closed";

    const fullSchedule =
        location.times
            .filter((time) => {
                return time.start.day == now.day;
            })
            .map((time) => {
                return `${format12Hour(time.start.hour, time.start.minute)} - ${format12Hour(time.end.hour, time.end.minute)}`;
            })
            .join(", ") || "closed";

    const embed = new EmbedBuilder()
        .setTitle(location.name)
        .setDescription(location.description)
        .addFields(
            { name: "Location", value: location.location },
            {
                name: "Open Status",
                value: currentStatus === "closed" ? "Closed now" : `Open now`,
            },
            {
                name: "Today's Hours",
                value: fullSchedule,
            },
        )
        .addFields({
            name: "Accepts Online Orders",
            value: location.acceptsOnlineOrders ? "Yes" : "No",
        })
        .setURL(location.url);

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${location.coordinates.lat},${location.coordinates.lng}&zoom=17&size=400x200&markers=color:red%7C${location.coordinates.lat},${location.coordinates.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    embed.setImage(url);

    return embed;
}

function formatLocations(locations: Location[]): EmbedBuilder[] {
    if (locations.length === 0) {
        return [
            new EmbedBuilder()
                .setTitle("Dining Locations")
                .setDescription(
                    "No dining locations matching search currently open.",
                ),
        ];
    }
    // embed field limit is 25, new embed for every 25
    const embeds = [];
    let currentEmbed = new EmbedBuilder()
        .setTitle("Dining Locations")
        .setDescription(
            "Here are the current dining locations matching search:",
        );

    for (const location of locations) {
        if ((currentEmbed.data.fields?.length ?? 0) >= 25) {
            embeds.push(currentEmbed);
            currentEmbed = new EmbedBuilder();
        }

        const now: Time = {
            day: new Date().getDay(),
            hour: new Date().getHours(),
            minute: new Date().getMinutes(),
        };

        const nowOpenTimes = location.times.filter(({ start, end }) =>
            isBetween(now, start, end),
        );

        const currentStatus =
            nowOpenTimes.length > 0
                ? nowOpenTimes
                      .filter((time) => {
                          return (
                              time.start.day == now.day && isOpen(location, now)
                          );
                      })
                      .map(
                          (time) =>
                              `${format12Hour(time.start.hour, time.start.minute)} - ${format12Hour(
                                  time.end.hour,
                                  time.end.minute,
                              )}`,
                      )
                      .join(", ")
                : "closed";

        const fullSchedule =
            location.times
                .filter((time) => {
                    return time.start.day == now.day;
                })
                .map(
                    (time) =>
                        `${format12Hour(time.start.hour, time.start.minute)} - ${format12Hour(
                            time.end.hour,
                            time.end.minute,
                        )}`,
                )
                .join(", ") || "Closed";

        currentEmbed.addFields({
            name: location.name,
            value: `**Location:** ${location.location}
                    **Open Status:** ${currentStatus === "closed" ? "Closed now" : "Open now"}
                    **Today's Hours:** ${fullSchedule}`,
        });
    }

    embeds.push(currentEmbed);
    return embeds;
}

const command: Command = {
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

        if (interaction.options.getSubcommand() === "all") {
            return interaction.reply({
                embeds: formatLocations(
                    locations.sort((a, b) => a.name.localeCompare(b.name)),
                ),
            });
        }
        if (interaction.options.getSubcommand() === "open") {
            const rightNow: Time = {
                day: new Date().getDay(),
                hour: new Date().getHours(),
                minute: new Date().getMinutes(),
            };

            const openLocations = locations.filter((location) =>
                isOpen(location, rightNow),
            );

            return interaction.reply({
                embeds: formatLocations(
                    openLocations.sort((a, b) => a.name.localeCompare(b.name)),
                ),
            });
        }
        if (interaction.options.getSubcommand() === "search") {
            const rawQuery = interaction.options.getString("name");
            const query = rawQuery?.toLowerCase() ?? null;

            const rawBuilding = interaction.options.getString("building");
            const building = rawBuilding?.toLowerCase() ?? null;

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

            if (matchedLocations.length === 1) {
                return interaction.reply({
                    embeds: [formatLocation(matchedLocations[0])],
                });
            }

            return interaction.reply({
                embeds: formatLocations(
                    matchedLocations.sort((a, b) =>
                        a.name.localeCompare(b.name),
                    ),
                ),
            });
        }
    },

    async autocomplete(_client, interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();

        const locations = await getLocations();

        let choices: { name: string; value: string }[] = [];

        if (focusedOption.name === "name") {
            choices = search(focusedValue, locations, {
                // ignoreCase is true by default
                keySelector: (loc) => loc.name,
            })
                .slice(0, 25)
                .map((loc) => ({ name: loc.name, value: loc.name }));
        } else if (focusedOption.name === "building") {
            const buildingMap = new Map<string, string>();
            locations.forEach((loc) => {
                const buildingName = loc.location.split(",")[0]!.trim();
                buildingMap.set(buildingName, buildingName);
                loc.locAliases?.forEach((alias) => {
                    buildingMap.set(alias, buildingName);
                });
            });

            const matchedKeys = search(
                focusedValue,
                Array.from(buildingMap.keys()),
                {
                    ignoreCase: true,
                },
            ).slice(0, 25);

            const seen = new Set<string>();
            choices = [];
            for (const key of matchedKeys) {
                const displayName = buildingMap.get(key)!;
                if (!seen.has(displayName)) {
                    choices.push({ name: displayName, value: displayName });
                    seen.add(displayName);
                }
            }
        }

        await interaction.respond(choices);
    },
};

export default command;
