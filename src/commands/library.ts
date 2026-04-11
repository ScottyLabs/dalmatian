import { EmbedBuilder, HexColorString, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../types.js";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";

type LibraryStatusInfo = {
    name: string;
    dates: {
        [date: string]: {
            status: "open" | "closed" | "text";
            text?: string;
            hours?: {
                from: string;
                to: string;
            }[];
        };
    };
};

type LibraryScheduleInfo = {
    locations: {
        lid: number;
        name: string;
        color: HexColorString;
        weeks: {
            [day: string]: {
                date: string;
                rendered: string;
                times: {
                    status: "open" | "closed" | "text" | "ByApp" | "not-set";
                    text?: string;
                    note?: string;
                    hours: {
                        from: string;
                        to: string;
                    }[];
                };
            };
        }[];
    }[];
};

const LIBRARY_FACILITIES = {
    "Hunt Library": "7070",
    "Sorrells Library": "7071",
    "Circulation Desk": "23808",
    "University Archives": "19043",
    "Mellon Library": "7072",
    "Qatar Library": "6859",
    "Posner Center": "7195",
} as Record<string, string>;

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("library")
        .setDescription("See which libraries are open!")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("Get status of all libraries!"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("schedule")
                .setDescription("Get the schedule of a specific library!")
                .addStringOption((option) =>
                    option
                        .setName("library")
                        .setDescription("The library to get the schedule of")
                        .setChoices(
                            Object.keys(LIBRARY_FACILITIES).map((e) => ({
                                name: e,
                                value: e,
                            })),
                        )
                        .setRequired(true),
                ),
        ),
    async execute(interaction) {
        if (interaction.options.getSubcommand() === "status") {
            await interaction.deferReply();

            const apiEndpoint = "https://cmu.libcal.com/api/1.0/hours";

            const libraries = ["7070", "7071", "7072", "7195"];

            const apiKey = "f350ce8f5f34fd1cae1ccee509352e59";

            const response = (await fetch(
                `${apiEndpoint}/${libraries.join(",")}?key=${apiKey}`,
            ).then((res) => res.json())) as LibraryStatusInfo[];

            if (!response) {
                const embed1 = new EmbedBuilder().setTitle(
                    "Failed to fetch library hours. Please try again later.",
                );

                await interaction.editReply({
                    embeds: [embed1],
                });
            }

            const etDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/New_York",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date());

            const embed = new EmbedBuilder().setTitle(
                `Current Library Status for ${etDate}`,
            );

            for (const library of response) {
                let fieldTitle = "";
                let fieldDescription = "";
                const todayStatus = library.dates[etDate];

                if (!todayStatus)
                    fieldTitle = `⚠️ ${library.name} (No status data available)**`;
                else if (todayStatus.status === "open") {
                    fieldTitle = `🟢 ${library.name} (Open)`;
                    fieldDescription = `from ${todayStatus.hours?.[0]?.from} to ${todayStatus.hours?.[0]?.to}`;
                } else if (todayStatus.status === "closed") {
                    fieldTitle = `⛔ ${library.name} (Closed)`;
                } else if (todayStatus.status === "text") {
                    fieldTitle = todayStatus.text
                        ? `⛔ ${library.name} (${todayStatus.text})`
                        : `⚠️ ${library.name} (No status data available)`;
                }

                embed.addFields({
                    name: fieldTitle,
                    value: fieldDescription,
                });
            }

            await interaction.followUp({
                embeds: [embed],
            });
        } else if (interaction.options.getSubcommand() === "schedule") {
            const libraryName = interaction.options.getString("library", true);
            const libraryId = LIBRARY_FACILITIES[libraryName];
            const weeks = 10000; //yes, this is absurd on purpose

            const response = await fetch(
                `https://cmu.libcal.com/api_hours_grid.php?format=json&weeks=${weeks}&systemTime=0`,
            );
            const data = (await response.json()) as LibraryScheduleInfo;
            const libraryData = data.locations.find(
                (loc) => loc.lid === parseInt(libraryId ?? "0"),
            );

            if (!data) {
                const embed1 = new EmbedBuilder().setTitle(
                    "Failed to fetch library schedule. Please try again later.",
                );

                await interaction.followUp({
                    embeds: [embed1],
                });
                return;
            }

            if (!libraryId || !libraryData || libraryData.weeks.length === 0) {
                const embed1 = new EmbedBuilder().setTitle(
                    "Failed to find library.",
                );

                await interaction.followUp({
                    embeds: [embed1],
                });
                return;
            }

            const embedColor =
                libraryData.color != "#000000"
                    ? libraryData.color
                    : DEFAULT_EMBED_COLOR;

            const tzString = "T00:00:00-05:00";

            const embeds: EmbedBuilder[] = [];

            weekLoop: for (const week of libraryData.weeks) {
                const editEmbed = new EmbedBuilder().setColor(embedColor);
                let dateRange: [string, string] = ["", ""];
                const days = Object.entries(week);

                for (const [i, [_day, info]] of days.entries()) {
                    if (i === 0) dateRange[0] = info.date;
                    if (i === days.length - 1) dateRange[1] = info.date;
                    //info.date is in EST

                    const dayName = new Date(
                        info.date + tzString,
                    ).toLocaleDateString("en-US", {
                        timeZone: "America/New_York",
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                    });

                    if (info.times.status === "not-set") break weekLoop;

                    let fieldTitle = "";
                    let fieldDescription = "";

                    if (info.times.status === "open") {
                        fieldTitle = `🟢 ${dayName} (Open)`;
                        fieldDescription = `from ${info.times.hours?.[0]?.from} to ${info.times.hours?.[0]?.to}`;
                    } else if (info.times.status === "closed") {
                        fieldTitle = `⛔ ${dayName} (Closed)`;
                    } else if (info.times.status === "ByApp") {
                        fieldTitle = `⚠️ ${dayName} (Open by appointment)`;
                    } else if (info.times.status === "text") {
                        fieldTitle = info.times.text
                            ? `⛔ ${dayName} (${info.times.text}`
                            : `⚠️ ${dayName} (No status data available)`;
                    }
                    if (info.times.note) {
                        fieldDescription += `\n📝 **Note:** ${info.times.note}`;
                    }

                    editEmbed.addFields({
                        name: fieldTitle,
                        value: fieldDescription,
                    });
                }

                const formattedStartDate = new Date(
                    dateRange[0] + tzString,
                ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/New_York",
                });
                const formattedEndDate = new Date(
                    dateRange[1] + tzString,
                ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "America/New_York",
                });
                editEmbed.setTitle(
                    `${libraryName} Schedule - ${formattedStartDate} to ${formattedEndDate}`,
                );

                embeds.push(editEmbed);
            }

            return new EmbedPaginator(embeds).send(interaction);
        }
    },
};

export default command;
