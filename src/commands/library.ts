import { EmbedBuilder, HexColorString, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../types.js";
import { DEFAULT_EMBED_COLOR } from "../constants.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { z } from "zod";

const libraryHoursRangeSchema = z.object({
    from: z.string(),
    to: z.string(),
});

const libraryStatusEntrySchema = z.object({
    status: z.enum(["open", "closed", "text"]),
    text: z.string().optional(),
    hours: z.array(libraryHoursRangeSchema).optional(),
});

const libraryStatusResponseSchema = z.array(
    z.object({
        name: z.string(),
        dates: z.record(z.string(), libraryStatusEntrySchema),
    }),
);

const libraryScheduleDaySchema = z.object({
    date: z.string(),
    rendered: z.string(),
    times: z.object({
        status: z.enum(["open", "closed", "text", "ByApp", "not-set"]),
        text: z.string().optional(),
        note: z.string().optional(),
        hours: z.array(libraryHoursRangeSchema).optional(),
    }),
});

const libraryScheduleResponseSchema = z.object({
    locations: z.array(
        z.object({
            lid: z.number(),
            name: z.string(),
            color: z.custom<HexColorString>(
                (value) =>
                    typeof value === "string" &&
                    /^#[0-9a-fA-F]{6}$/.test(value),
            ),
            weeks: z.array(z.record(z.string(), libraryScheduleDaySchema)),
        }),
    ),
});

const LIBRARY_FACILITIES = {
    "Hunt Library": "7070",
    "Sorrells Library": "7071",
    "Circulation Desk": "23808",
    "University Archives": "19043",
    "Mellon Library": "7072",
    "Qatar Library": "6859",
    "Posner Center": "7195",
} as Record<string, string>;

function getETOffset(at: Date = new Date()) {
    const etAbbrev = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        timeZoneName: "short",
    })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value;

    return etAbbrev === "EDT" ? "-04:00" : "-05:00";
}

function inTimePeriod(from: string, to: string, now = new Date()) {
    if (!from || !to) return false;

    const etDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);

    const etOffset = getETOffset(now);

    function parseTime(time: string): Date {
        const match = time.trim().match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
        if (!match) {
            throw new Error(`Invalid time format: ${time}`);
        }

        const hours = Number.parseInt(match[1] ?? "0", 10);
        const minutes = Number.parseInt(match[2] ?? "0", 10);
        const amOrPm = (match[3] ?? "").toLowerCase();

        if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
            throw new Error(`Invalid time format: ${time}`);
        }

        let hours24 = hours % 12;

        if (amOrPm === "pm") {
            hours24 += 12;
        }

        const hh = String(hours24).padStart(2, "0");
        const mm = String(minutes).padStart(2, "0");
        return new Date(`${etDate}T${hh}:${mm}:00${etOffset}`);
    }

    const start = parseTime(from);
    const end = parseTime(to);

    if (end > start) {
        return now >= start && now <= end;
    }

    const endNext = new Date(end);
    endNext.setDate(endNext.getDate() + 1);

    const startPrev = new Date(start);
    startPrev.setDate(startPrev.getDate() - 1);

    return (now >= start && now <= endNext) || (now >= startPrev && now <= end);
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("library")
        .setDescription("See which libraries are open!")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("all")
                .setDescription("Get status of all libraries!"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("open")
                .setDescription("Find all open libraries!"),
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
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "all" || subcommand === "open") {
            const apiEndpoint = "https://cmu.libcal.com/api/1.0/hours";

            const libraries = [
                "Hunt Library",
                "Sorrells Library",
                "Mellon Library",
                "Posner Center",
            ].map((name) => LIBRARY_FACILITIES[name]);

            const apiKey = "f350ce8f5f34fd1cae1ccee509352e59"; //This is just the one the CMU website uses, hopefully nobody is too angy that I hopped it

            const responseRaw = await fetch(
                `${apiEndpoint}/${libraries.join(",")}?key=${apiKey}`,
            )
                .then((res) => res.json())
                .catch((_) => undefined);

            const responseResult =
                libraryStatusResponseSchema.safeParse(responseRaw);

            if (!responseResult.success) {
                const embed1 = new EmbedBuilder().setTitle(
                    "Failed to fetch library hours. Please try again later.",
                );

                await interaction.editReply({
                    embeds: [embed1],
                });
                return;
            }

            const response = responseResult.data;

            const etDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/New_York",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date());

            const displayEtDate = new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "America/New_York",
            });

            const embedTitle =
                subcommand === "open"
                    ? `Currently Open Libraries for ${displayEtDate}`
                    : `Current Library Status for ${displayEtDate}`;

            const embed = new EmbedBuilder().setTitle(embedTitle);

            for (const library of response) {
                let fieldTitle = "";
                let fieldDescription = "";
                const todayStatus = library.dates[etDate];

                if (!todayStatus) {
                    fieldTitle = `⚠️ ${library.name} (No status data available)**`;
                } else {
                    if (todayStatus.status === "open" && todayStatus.hours) {
                        const currentlyOpen = todayStatus.hours.some((h) =>
                            inTimePeriod(h.from, h.to),
                        );
                        if (!currentlyOpen) todayStatus.status = "closed"; // the api likes trolling and will tell us it's open even if we're out of hours
                    }

                    if (
                        subcommand === "open" &&
                        todayStatus.status !== "open"
                    ) {
                        continue;
                    }

                    switch (todayStatus.status) {
                        case "open":
                            fieldTitle = `🟢 ${library.name} (Open)`;
                            if (todayStatus.hours?.[0])
                                fieldDescription = `open from ${todayStatus.hours[0].from} to ${todayStatus.hours[0].to}`;
                            break;
                        case "closed":
                            fieldTitle = `⛔ ${library.name} (Closed)`;
                            if (todayStatus.hours?.[0])
                                fieldDescription = `open from ${todayStatus.hours[0].from} to ${todayStatus.hours[0].to}`;
                            break;
                        case "text":
                            fieldTitle = todayStatus.text
                                ? `⛔ ${library.name} (${todayStatus.text})`
                                : `⚠️ ${library.name} (No status data available)`;
                            break;
                    }
                }

                embed.addFields({
                    name: fieldTitle,
                    value: fieldDescription,
                });
            }

            if ((embed.toJSON().fields?.length || 0) === 0)
                embed.setDescription("No libraries are currently open!");

            await interaction.followUp({
                embeds: [embed],
            });
        } else if (subcommand === "schedule") {
            const libraryName = interaction.options.getString("library", true);
            const libraryId = LIBRARY_FACILITIES[libraryName];
            const weeks = 1000; //yes, this is absurd on purpose, it won't try giving more than it can (or rather, all of them will have status not-set)

            const responseRaw = await fetch(
                `https://cmu.libcal.com/api_hours_grid.php?format=json&weeks=${weeks}&systemTime=0`,
            )
                .then((f) => f.json())
                .catch((_) => undefined);

            const responseResult =
                libraryScheduleResponseSchema.safeParse(responseRaw);

            if (!responseResult.success) {
                console.log(JSON.stringify(responseResult.error.format()));
                console.log(responseRaw);
                const embed1 = new EmbedBuilder().setTitle(
                    "Failed to fetch library schedule. Please try again later.",
                );

                await interaction.followUp({
                    embeds: [embed1],
                });
                return;
            }

            const data = responseResult.data;
            const libraryData = data.locations.find(
                (loc) => loc.lid === parseInt(libraryId ?? "0"),
            );

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
                libraryData.color !== "#000000"
                    ? libraryData.color
                    : DEFAULT_EMBED_COLOR;

            const etOffset = getETOffset();

            const tzString = `T00:00:00${etOffset}`;

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
                        if (info.times.hours?.[0]) {
                            fieldDescription = `from ${info.times.hours[0].from} to ${info.times.hours[0].to}`;
                        }
                    } else if (info.times.status === "closed") {
                        fieldTitle = `⛔ ${dayName} (Closed)`;
                    } else if (info.times.status === "ByApp") {
                        fieldTitle = `⚠️ ${dayName} (Open by appointment)`;
                    } else if (info.times.status === "text") {
                        fieldTitle = info.times.text
                            ? `⛔ ${dayName} (${info.times.text})`
                            : `⚠️ ${dayName} (No status data available)`;
                    }
                    if (info.times.note) {
                        fieldDescription += ` • 📝 **Note:** ${info.times.note}`;
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
