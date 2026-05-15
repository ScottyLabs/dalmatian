import {
    ActionRowBuilder,
    Attachment,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    bold,
    EmbedBuilder,
    hyperlink,
    italic,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    underline,
} from "discord.js";
import { FYW_MINIS, SCOTTYLABS_URL } from "../constants.js";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import {
    FCE_DATA_BY_COURSE,
    FCE_STARTUP_CACHE,
    FCEData,
    FCERecord,
} from "../utils/fceCache.ts";
import { COURSES_DATA, Course, formatCourseNumber } from "../utils/index.ts";

const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

//modified from https://sashamaps.net/docs/resources/20-colors/
const Colors = [
    "#e6194b",
    "#3cb44b",
    "#ffe119",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#46f0f0",
    "#f032e6",
    "#bcf60c",
    "#fabebe",
    "#008080",
    "#e6beff",
    "#9a6324",
    "#fffac8",
    "#800000",
    "#aaffc3",
    "#808000",
    "#ffd8b1",
    "#000075",
    "#076f00",
];

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("fce")
        .setDescription("Get average FCE ratings for courses")
        .addStringOption((option) =>
            option
                .setName("course_codes")
                .setDescription(
                    "Course codes separated by spaces or commas (e.g., 15-112 21-127,15-122)",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        const coursesData = COURSES_DATA;
        const input = interaction.options.getString("course_codes", true);
        const rawCodes = input.split(/[\s,]+/).filter((code) => code.trim());

        if (rawCodes.length === 0) {
            return interaction.reply({
                content: "Please provide at least one course code.",
                flags: MessageFlags.Ephemeral,
            });
        }

        if (rawCodes.length > 20) {
            return interaction.reply({
                content: "Please provide no more than 20 courses at once.",
                flags: MessageFlags.Ephemeral,
            });
        }

        type ValidCourse = {
            code: string;
            course: Course;
            fce: FCEData;
        };

        const fceData = FCE_DATA_BY_COURSE;
        const summaryByCourseCode = FCE_STARTUP_CACHE.summaryByCourseCode;
        const summaryByInstructorByCourseCode =
            FCE_STARTUP_CACHE.summaryByInstructorByCourseCode;

        const validCourses: Array<ValidCourse> = [];
        const invalidCodes: string[] = [];
        const noCourseData: string[] = [];
        const noFCEData: string[] = [];

        for (const rawCode of rawCodes) {
            const courseCode = formatCourseNumber(rawCode);

            if (!courseCode) {
                invalidCodes.push(rawCode);
                continue;
            }

            if (!coursesData[courseCode]) {
                noCourseData.push(courseCode);
                continue;
            }

            if (!fceData[courseCode]) {
                noFCEData.push(courseCode);
                continue;
            }

            validCourses.push({
                code: courseCode,
                course: coursesData[courseCode],
                fce: fceData[courseCode],
            });
        }

        if (validCourses.length === 0) {
            let errorMsg = "No valid courses with FCE data found.\n";
            if (invalidCodes.length > 0) {
                errorMsg += `Invalid format: ${invalidCodes.join(", ")}`;
            }
            if (noCourseData.length > 0) {
                errorMsg += `Not found: ${noCourseData.join(", ")}`;
            }
            if (noFCEData.length > 0) {
                errorMsg += `No FCE data: ${noFCEData.join(", ")}`;
            }
            return interaction.reply({
                content: errorMsg,
                flags: MessageFlags.Ephemeral,
            });
        }

        const notFound = [...invalidCodes, ...noCourseData, ...noFCEData];

        if (validCourses.length === 1) {
            const { code, course, fce } = validCourses[0]!;
            const summary = summaryByCourseCode.get(code)!;

            const baseEmbed = new EmbedBuilder()
                .setTitle(
                    `${underline(`${code}: ${course.name}`)} (${course.units} units)`,
                )
                .setURL(`${SCOTTYLABS_URL}/course/${code}`);

            function joinAndTruncate(
                items: string[],
                max = 7,
                buffer = 2,
            ): string {
                if (items.length <= max) {
                    return items.join(", ");
                }

                const cutoff = max - buffer;
                const shown = items.slice(0, cutoff).join(", ");
                const hidden = items.length - cutoff;

                return `${shown}, and ${hidden} more...`;
            }

            function createFCEEntry(
                title: string,
                semesterLabels: string[],
                teachingRate: number,
                courseRate: number,
                workload: number,
                responseRate: number,
            ) {
                return (
                    `${bold(title)} ${italic(`(${joinAndTruncate(semesterLabels)})`)}\n` +
                    `Teaching: ${bold(teachingRate.toFixed(2))}/5 • ` +
                    `Course: ${bold(courseRate.toFixed(2))}/5\n` +
                    `Workload: ${bold(workload.toFixed(2))} hrs/wk • ` +
                    `Response Rate: ${bold(`${responseRate.toFixed(1)}%`)}`
                );
            }

            const summaryPage = EmbedBuilder.from(baseEmbed).addFields(
                {
                    name: "Teaching",
                    value: `${bold(summary.teachingRate.toFixed(1))}/5`,
                    inline: true,
                },
                {
                    name: "Course",
                    value: `${bold(summary.courseRate.toFixed(1))}/5`,
                    inline: true,
                },
                {
                    name: "Workload",
                    value: `${bold(summary.workload.toFixed(1))} hrs/wk`,
                    inline: true,
                },
            );

            const instructorMap = summaryByInstructorByCourseCode.get(code);
            const byInstructorEntries = Array.from(
                instructorMap ?? [],
                ([instructor, instructorSummary]) => {
                    const name = instructor.toUpperCase();
                    const url = `${SCOTTYLABS_URL}/instructor/${encodeURIComponent(name)}`;

                    return createFCEEntry(
                        hyperlink(name, url),
                        instructorSummary.semesterLabels,
                        instructorSummary.teachingRate,
                        instructorSummary.courseRate,
                        instructorSummary.workload,
                        instructorSummary.responseRate,
                    );
                },
            );

            const allSemesterEntries = fce.records.map((record) => {
                const name = record.instructor.toUpperCase();
                const url = `${SCOTTYLABS_URL}/instructor/${encodeURIComponent(name)}`;

                return createFCEEntry(
                    hyperlink(name, url),
                    [record.semesterLabel],
                    record.overallTeachingRate,
                    record.overallCourseRate,
                    record.hrsPerWeek,
                    record.responseRate,
                );
            });

            function buildFCEPages(entries: string[]): EmbedBuilder[] {
                const pages: EmbedBuilder[] = [];
                let chunk: string[] = [];
                let index = 0;

                if (notFound.length > 0) {
                    chunk.push(
                        `:warning: ${bold("Warning:")} ${notFound.length === 1 ? "Course" : "Courses"} ${notFound.join(", ")} not found`,
                    );
                }

                for (const entry of entries) {
                    chunk.push(entry);
                    index++;

                    if (chunk.length >= 5 || index === entries.length) {
                        const embed = EmbedBuilder.from(
                            baseEmbed,
                        ).setDescription(chunk.join("\n\n"));
                        pages.push(embed);
                        chunk = [];
                    }
                }

                return pages;
            }
            async function buildFCEGraph(
                entries: FCERecord[],
            ): Promise<EmbedBuilder[]> {
                const pages: EmbedBuilder[] = [];
                let chunk: string[] = [];
                let index = 0;
                let chartData = [];

                if (notFound.length > 0) {
                    chunk.push(
                        `:warning: ${bold("Warning:")} ${notFound.length === 1 ? "Course" : "Courses"} ${notFound.join(", ")} not found`,
                    );
                }

                const instructorMap = new Map<string, FCERecord[]>();
                for (const record of entries) {
                    const instructor = record.instructor;
                    if (!instructorMap.has(instructor)) {
                        instructorMap.set(instructor, []);
                    }
                    const stats = instructorMap.get(instructor)!;
                    stats.push(record);
                }
                for (const [instructor, data] of instructorMap) {
                    let text = `${instructor}`;
                    //let text = "G";
                    let fcePoints = [];
                    const name = instructor.toUpperCase();
                    chunk.push(text);
                    for (const record of data) {
                        const season = record.semesterLabel[0];
                        const year = Number(record.semesterLabel.slice(1));

                        const xPoint = season === "S" ? year + 0.5 : year;
                        //text += `${record.hrsPerWeek}, ${record.semesterLabel} \n`;
                        fcePoints.push({ x: xPoint, y: record.hrsPerWeek });
                    }
                    chartData.push({
                        type: "scatter",
                        label: name,
                        data: fcePoints,
                        backgroundColor: Colors[index % 20],
                        pointBorderColor: Colors[index % 20],
                        pointBackgroundColor: Colors[index % 20] + "80",
                    });

                    index++;

                    if (chunk.length >= 5 || index === instructorMap.size) {
                        const embed = EmbedBuilder.from(
                            baseEmbed,
                        ).setDescription(chunk.join("\n\n"));

                        const chart = {
                            type: "scatter",
                            data: {
                                datasets: chartData,
                            },
                            options: {
                                plugins: {
                                    title: {
                                        display: true,
                                        text: `${course.id}: ${course.name}`,
                                    },
                                    legend: {
                                        labels: {
                                            filter: (
                                                legendItem: any,
                                                chart: any,
                                            ) => {
                                                return !String(legendItem.text)
                                                    .toLowerCase()
                                                    .includes("line");
                                            },
                                        },
                                    },
                                },

                                scales: {
                                    x: {
                                        ticks: {
                                            callback: function (value: number) {
                                                if (
                                                    value - Math.floor(value) >
                                                    0
                                                ) {
                                                    return `${Math.floor(value)} S`;
                                                }
                                                return `${Math.floor(value)} F`;
                                            },
                                        },
                                        title: {
                                            text: `Year`,
                                            display: true,
                                        },
                                    },
                                    y: {
                                        title: {
                                            text: `FCE`,
                                            display: true,
                                        },
                                    },
                                },
                            },
                        };
                        const response = await fetch(
                            "https://quickchart.io/chart/create",
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    chart,
                                    backgroundColor: "white",
                                    version: "4",
                                }),
                            },
                        );

                        if (!response.ok) {
                            throw new Error("Failed to create chart");
                        }

                        const json = await response.json();
                        console.log(json);
                        // Short persistent URL
                        const chartUrl = json.url;
                        // const chartUrl = `https://quickchart.io/chart?bkg=%23ffffff&c=${encodedChart}`;
                        embed.setImage(chartUrl);
                        pages.push(embed);

                        chunk = [];
                    }
                }

                return pages;
            }
            const selectOptions = [
                {
                    label: "Summary",
                    value: "summary",
                    default: true,
                    pages: [summaryPage],
                },
                {
                    label: "Aggregate By Instructor",
                    value: "aggregate_by_instructor",
                    pages: buildFCEPages(byInstructorEntries),
                },
                {
                    label: "All Semesters",
                    value: "all_semesters",
                    pages: buildFCEPages(allSemesterEntries),
                },
                {
                    label: "FCE Graph",
                    value: "graph",
                    pages: await buildFCEGraph(fce.records),
                },
            ];

            const selectRow =
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("fce_select_menu")
                        .addOptions(selectOptions),
                );

            const paginator = new EmbedPaginator({
                pages: selectOptions[0]!.pages,
                components: [selectRow],
                async onCollect(collectInteraction) {
                    if (!collectInteraction.isStringSelectMenu()) return;
                    const choice = collectInteraction.values[0]!;
                    const selected = selectOptions.find(
                        (option) => option.value === choice,
                    );
                    paginator.setPages(selected!.pages);
                    selectRow.components[0]?.setOptions(
                        selectOptions.map((option) => ({
                            ...option,
                            default: option.value === choice,
                        })),
                    );
                },
            });
            await paginator.send(interaction);
            return;
        }

        function formatLine(workload: number, text: string, total = false) {
            let left = `${bold(workload.toFixed(1))} hrs/wk`;
            let right = text;
            if (total) {
                left = underline(left);
                right = underline(right);
            }
            if (workload.toFixed(1).length === 3) {
                return `${left} - ${right}`;
            }
            return `${left} - ${right}`;
        }

        let description = "";
        let totalUnits = 0;
        let unitIssuePostFixer = "";
        for (const { code, course, fce } of validCourses) {
            const summary = summaryByCourseCode.get(code)!;
            const courseName = fce.courseName.toUpperCase();
            description +=
                formatLine(
                    summary.workload,
                    hyperlink(
                        `${bold(code)} (${courseName})`,
                        `${SCOTTYLABS_URL}/course/${code}`,
                    ),
                ) + "\n";
            if (!Number.isNaN(Number(course.units))) {
                totalUnits += Number(course.units);
            } else {
                unitIssuePostFixer = "+";
            }
        }

        let totalHours = validCourses.reduce(
            (sum, { code }) => sum + summaryByCourseCode.get(code)!.workload,
            0,
        );
        const fywMinis = validCourses.filter(({ code }) =>
            FYW_MINIS.includes(code),
        );
        if (fywMinis.length === 2) {
            const miniWorkload =
                summaryByCourseCode.get(fywMinis[0]!.code)!.workload +
                summaryByCourseCode.get(fywMinis[1]!.code)!.workload;
            const miniAvg = miniWorkload / 2;
            totalHours -= miniWorkload;
            totalHours += miniAvg;
        }

        description += formatLine(totalHours, bold("Total FCE"), true);
        if (fywMinis.length === 2) {
            description += `\n:pencil: ${bold("Note:")} First-year writing minis averaged`;
        }
        if (notFound.length > 0) {
            description += `\n:warning: ${bold("Warning:")} ${notFound.length === 1 ? "Course" : "Courses"} ${notFound.join(", ")} not found`;
        }

        const embed = new EmbedBuilder()
            .setTitle(
                `FCE for ${validCourses.length} Courses (${totalUnits.toFixed(1)}${unitIssuePostFixer} units)`,
            )
            .setDescription(description);

        const courseList = validCourses.map(({ code }) => code).join(",");
        const url =
            `http://courses.scottylabs.org/schedules/shared?courses=` +
            courseList;
        const button = new ButtonBuilder()
            .setLabel("View schedule")
            .setURL(url)
            .setStyle(ButtonStyle.Link);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        return interaction.reply({
            embeds: [embed],
            components: [row],
        });
    },
};

export default command;
