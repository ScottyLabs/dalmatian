import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import {
    bold,
    EmbedBuilder,
    hyperlink,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import type { ChartConfiguration, ChartData, LegendItem } from "chart.js";
import { SCOTTYLABS_URL } from "../constants.ts";
import { COURSES_DATA } from "../utils/index.ts";
import type { SlashCommand } from "../types.d.ts";
import type { Course } from "../utils/index.ts";

//TODO: many of these fields could be made into CourseCodes

type FCEData = {
    courseNum: string;
    courseName: string;
    overallTeachingRate: number;
    overallCourseRate: number;
    hrsPerWeek: number;
    responseRate: number;
    count: number;
    records: FCERecord[];
};

type FCERecord = {
    year: number;
    semester: string;
    section: string;
    instructor: string;
    hrsPerWeek: number;
    overallTeachingRate: number;
    overallCourseRate: number;
    responseRate: number;
};

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
function loadCoursesData(): Record<string, Course> {
    return COURSES_DATA;
}

function formatCourseNumber(courseNumber: string): string | null {
    if (courseNumber.match(/^\d{2}(-| )?\d{3}$/)) {
        if (courseNumber.includes("-")) {
            return courseNumber;
        } else if (courseNumber.includes(" ")) {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(3)}`;
        } else {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(2)}`;
        }
    }

    return null;
}

function loadFCEData(): Record<string, FCEData> {
    const fceMap: Record<string, FCEData> = {};
    const csvPath = join(import.meta.dirname!, "../data/fce_data.csv");
    const csvContent = readFileSync(csvPath, "utf-8");

    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
    }) as Array<Record<string, string>>;

    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 5;

    for (const record of records) {
        const dept = record["Dept"];
        const num = record["Num"];
        const semester = record["Sem"];
        const year = parseInt(record["Year"] ?? "0");
        if (!dept || !num) continue;

        // Only consider FCEs from the past 5 years
        if (year < cutoffYear) continue;

        const formattedCode = formatCourseNumber(num)!;

        const hrsPerWeek = parseFloat(record["Hrs Per Week"] ?? "");
        const overallTeachingRate = parseFloat(record["Overall teaching rate"] ?? "");
        const overallCourseRate = parseFloat(record["Overall course rate"] ?? "");
        const responseRate = parseFloat(record["Response Rate"] ?? "");

        if (isNaN(hrsPerWeek) || isNaN(overallTeachingRate) || isNaN(overallCourseRate)) {
            continue;
        }

        if (!fceMap[formattedCode]) {
            const courseName = record["Course Name"] ?? "";
            fceMap[formattedCode] = {
                courseNum: formattedCode,
                courseName: courseName,
                overallTeachingRate: 0,
                overallCourseRate: 0,
                hrsPerWeek: 0,
                responseRate: 0,
                count: 0,
                records: [],
            };
        }

        const instructor = record["Instructor"] ?? "";
        const section = record["Section"] ?? "";

        fceMap[formattedCode].records.push({
            year,
            semester: semester ?? "",
            section,
            instructor,
            hrsPerWeek,
            overallTeachingRate,
            overallCourseRate,
            responseRate,
        });

        if (semester && !semester.toLowerCase().includes("summer")) {
            fceMap[formattedCode].overallTeachingRate += overallTeachingRate;
            fceMap[formattedCode].overallCourseRate += overallCourseRate;
            fceMap[formattedCode].hrsPerWeek += hrsPerWeek;
            fceMap[formattedCode].responseRate += responseRate;
            fceMap[formattedCode].count++;
        }
    }

    for (const courseCode in fceMap) {
        const data = fceMap[courseCode];
        if (!data) continue;
        data.overallTeachingRate = data.overallTeachingRate / data.count;
        data.overallCourseRate = data.overallCourseRate / data.count;
        data.hrsPerWeek = data.hrsPerWeek / data.count;
        data.responseRate = data.responseRate / data.count;
    }

    return fceMap;
}
function findLineByLeastSquares(values_x: number[], values_y: number[]): [number, number] {
    let sum_x = 0;
    let sum_y = 0;
    let sum_xy = 0;
    let sum_xx = 0;
    let count = 0;

    const values_length = values_x.length;

    if (values_length !== values_y.length) {
        throw new Error("The parameters values_x and values_y need to have same size!");
    }

    if (values_length === 0) {
        throw new Error("Input arrays cannot be empty.");
    }

    for (let i = 0; i < values_length; i++) {
        const x = values_x[i]!;
        const y = values_y[i]!;

        sum_x += x;
        sum_y += y;
        sum_xx += x * x;
        sum_xy += x * y;
        count++;
    }

    // y = mx + b
    const m = (count * sum_xy - sum_x * sum_y) / (count * sum_xx - sum_x * sum_x);

    const b = sum_y / count - (m * sum_x) / count;

    return [m, b];
}

function findLineByLeastSquaresWeighted(
    values_x: number[],
    values_y: number[],
    xCenter: number,
    span: number,
): [number, number] {
    let sum_w = 0;
    let sum_wx = 0;
    let sum_wy = 0;
    let sum_wxy = 0;
    let sum_wxx = 0;

    const values_length = values_x.length;

    if (values_length !== values_y.length) {
        throw new Error("The parameters values_x and values_y need to have same size!");
    }

    if (values_length === 0) {
        throw new Error("Input arrays cannot be empty.");
    }

    for (let i = 0; i < values_length; i++) {
        const x = values_x[i]!;
        const y = values_y[i]!;
        const h = (x - xCenter) / span;
        const w = Math.max(0, Math.pow(1 - Math.pow(Math.abs(h), 3), 3));

        sum_w += w;
        sum_wx += w * x;
        sum_wy += w * y;
        sum_wxx += w * x * x;
        sum_wxy += w * x * y;
    }

    // y = mx + b

    const denominator = sum_w * sum_wxx - sum_wx * sum_wx;
    const m = denominator === 0 ? 0 : (sum_w * sum_wxy - sum_wx * sum_wy) / denominator;
    if (sum_w === 0) {
        throw new Error("LOWESS has no observations within the smoothing span.");
    }
    const b = (sum_wy - m * sum_wx) / sum_w;

    return [m, b];
}
function LOWESS(values_x: number[], values_y: number[]): Array<{ x: number; y: number }> {
    const n = values_x.length;

    if (n !== values_y.length) {
        throw new Error("The parameters values_x and values_y need to have same size!");
    }

    if (n === 0) {
        throw new Error("Input arrays cannot be empty.");
    }

    const [first, last] = values_x.reduce(
        ([min, max], x) => [Math.min(min, x), Math.max(max, x)],
        [Infinity, -Infinity],
    );
    const range = last - first;
    const fraction = n < 4 || range < 3 ? 1 : 0.5;
    const neighborCount = Math.min(n, Math.ceil(n * fraction));
    const output = [];
    for (let i = first; i <= last; i += 1) {
        const distances = values_x.map((x) => Math.abs(x - i)).sort((a, b) => a - b);
        const neighborDistance = distances[neighborCount - 1]!;
        const span =
            (neighborDistance || distances.find((distance) => distance > 0) || 1) * 1.000001;
        const [m, b] = findLineByLeastSquaresWeighted(values_x, values_y, i, span);
        output.push({ x: i, y: m * i + b });
    }
    return output;
}
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("fcegraph")
        .setDescription("Get information about courses offered at CMU")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("fce-graph")
                .setDescription("Get a graph of fce data over time")
                .addStringOption((option) =>
                    option
                        .setName("course_code")
                        .setDescription("Course code in XX-XXX or XXXXX format (e.g., 15-112)")
                        .setRequired(true),
                ),
        ),
    async execute(interaction) {
        console.log("start");
        const coursesData = loadCoursesData();
        if (interaction.options.getSubcommand() === "fce-graph") {
            const courseCode = formatCourseNumber(
                interaction.options.getString("course_code", true),
            );

            if (!courseCode) {
                return interaction.reply({
                    content: "Please provide a valid course code in the format XX-XXX or XXXXX.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!coursesData[courseCode]) {
                return interaction.reply({
                    content: `Course with code ${courseCode} not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const course = coursesData[courseCode];
            const fceData = loadFCEData();

            if (!fceData[courseCode]) {
                return interaction.reply({
                    content: "No valid FCE data found",
                    flags: MessageFlags.Ephemeral,
                });
            }
            await interaction.deferReply();

            const fce = fceData[courseCode];

            const semesterOrder: Record<string, number> = {
                Spring: 0,
                Summer: 1,
                Fall: 2,
            };
            const semesterCodes: Record<string, string> = {
                Fall: "F",
                Summer: "M",
                Spring: "S",
            };
            const semesterNames: Record<string, string> = {
                Fall: "F",
                Summer: "M",
                Spring: "S",
            };
            const axisTerms = [
                ...new Map(
                    fce.records.map((record) => [`${record.year}-${record.semester}`, record]),
                ).values(),
            ].sort(
                (a, b) =>
                    a.year - b.year ||
                    (semesterOrder[a.semester] ?? 99) - (semesterOrder[b.semester] ?? 99),
            );
            const termIndex = new Map(
                axisTerms.map((record, index) => [`${record.year}-${record.semester}`, index]),
            );
            const termLabels = axisTerms.map(
                (record) => `${record.year} ${semesterNames[record.semester] ?? "?: Unknown"}`,
            );

            type InstructorFCE = {
                teachingRate: number;
                courseRate: number;
                workload: number;
                responseRate: number;
                x: number;
                termLabel: string;
            };

            const instructorMap = new Map<string, InstructorFCE[]>();

            for (const record of fce.records) {
                const instructor = record.instructor;
                if (!instructorMap.has(instructor)) {
                    instructorMap.set(instructor, []);
                }
                const stats = instructorMap.get(instructor)!;
                const teachingRate = record.overallTeachingRate;
                const courseRate = record.overallCourseRate;
                const workload = record.hrsPerWeek;
                const responseRate = record.responseRate;
                const x = termIndex.get(`${record.year}-${record.semester}`);
                if (x === undefined) continue;
                stats.push({
                    teachingRate,
                    courseRate,
                    workload,
                    responseRate,
                    x,
                    termLabel: `${record.year} ${semesterCodes[record.semester] ?? "?"}`,
                });
            }

            const embeds = [];
            let chunk = [];

            chunk.push(
                `:pushpin: ${bold("Aggregate Data (past 5 years, excluding summers)")}\n` +
                    `Teaching: ${bold(fce.overallTeachingRate.toFixed(2))}/5 • ` +
                    `Course: ${bold(fce.overallCourseRate.toFixed(2))}/5\n` +
                    `Workload: ${bold(fce.hrsPerWeek.toFixed(2))} hrs/wk • ` +
                    `Response Rate: ${bold(`${fce.responseRate.toFixed(1)}%`)}`,
            );
            let i = 0;
            const chartData: ChartConfiguration["data"]["datasets"] = [];
            for (const [instructor, data] of instructorMap) {
                const name = instructor.toUpperCase();
                const url = `${SCOTTYLABS_URL}/instructor/${encodeURIComponent(name)}`;
                const fcePoints = [];
                let text = `${hyperlink(bold(name), url)}\n`;
                for (const stats of data) {
                    text +=
                        `${underline(`Semester: ${bold(`(${stats.termLabel})`)}`)}\n` +
                        `Teaching: ${bold(stats.teachingRate.toFixed(2))}/5 • ` +
                        `Course: ${bold(stats.courseRate.toFixed(2))}/5\n` +
                        `Workload: ${bold(stats.workload.toFixed(2))} hrs/wk • ` +
                        `Response Rate: ${bold(`${stats.responseRate.toFixed(1)}%`)}`;
                    text += `\n\n`;
                    fcePoints.push({ x: stats.x, y: stats.workload });
                }
                //chunk.push(text);
                const xValues = fcePoints.map((p) => p.x);
                const yValues = fcePoints.map((p) => p.y);
                chartData.push({
                    type: "scatter",
                    label: name,
                    data: fcePoints,
                    // backgroundColor: Colors[i % 20],
                    pointBorderColor: Colors[i % 20],
                    pointBackgroundColor: Colors[i % 20],
                });
                if (xValues.length > 1) {
                    let bestfitline: Array<{ x: number; y: number }> = [];
                    const [m, b] = findLineByLeastSquares(xValues, yValues);
                    const [first, last] = xValues.reduce(
                        ([min, max], x) => [Math.min(min, x), Math.max(max, x)],
                        [Infinity, -Infinity],
                    );
                    if (xValues.length === 2) {
                        bestfitline.push({ x: first, y: m * first + b });
                        bestfitline.push({ x: last, y: m * last + b });
                    } else {
                        bestfitline = LOWESS(xValues, yValues);
                    }
                    chartData.push({
                        type: "line",
                        label: "",
                        data: bestfitline,
                        // [first, m * first + b],
                        // [last, m * last + b],
                        pointRadius: 0,
                        borderWidth: 5,
                        backgroundColor: Colors[i % 20] + `d0`,
                        borderColor: Colors[i % 20] + `d0`,
                        hidden: false,
                        //tension: 0.5,
                    });
                }
                // chunk.push(
                //     `${hyperlink(bold(name), url)} ${italic(`(${stats.year})`)}\n` +
                //         `Teaching: ${bold(stats.teachingRate.toFixed(2))}/5 • ` +
                //         `Course: ${bold(stats.courseRate.toFixed(2))}/5\n` +
                //         `Workload: ${bold(stats.workload.toFixed(2))} hrs/wk • ` +
                //         `Response Rate: ${bold(`${(stats.responseRate).toFixed(1)}%`)}`,
                // );
                i++;
                //if (chunk.length >= 5 || i == instructorMap.size) {
            }
            const description = chunk.join("\n\n");
            const embed = new EmbedBuilder()
                .setTitle(`${underline(`${courseCode}: ${course.name}`)} (${course.units} units)`)
                .setURL(`${SCOTTYLABS_URL}/course/${courseCode}`)
                .setDescription(description);

            const chart: ChartConfiguration = {
                type: "scatter",
                data: {
                    labels: termLabels,
                    datasets: chartData,
                },
                options: {
                    plugins: {
                        title: {
                            display: true,
                            text: `${courseCode}: ${course.name}`,
                        },
                        legend: {
                            labels: {
                                filter: (item: LegendItem, data: ChartData) =>
                                    item.datasetIndex !== undefined &&
                                    data.datasets[item.datasetIndex]?.type !== "line",
                            },
                        },
                    },

                    scales: {
                        x: {
                            type: "linear",
                            min: 0,
                            max: termLabels.length - 1,
                            ticks: {
                                stepSize: 1,
                                callback: (value: string | number) =>
                                    termLabels[Math.round(Number(value))] ?? "",
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
            const filterMarker = "__QUICKCHART_LEGEND_FILTER__";
            const tickCallbackMarker = "__QUICKCHART_TICK_CALLBACK__";
            const chartConfig = JSON.stringify(chart, (key, value) =>
                typeof value !== "function"
                    ? value
                    : key === "filter"
                      ? filterMarker
                      : key === "callback"
                        ? tickCallbackMarker
                        : value,
            );
            if (!chartConfig) {
                throw new Error("Failed to serialize chart configuration");
            }
            const chartSource = chartConfig
                .replace(
                    `"${filterMarker}"`,
                    `function(item, data) {
          return data.datasets[item.datasetIndex].type !== "line";
        }`,
                )
                .replace(
                    `"${tickCallbackMarker}"`,
                    `function(value) {
            return ${JSON.stringify(termLabels)}[Math.round(Number(value))] || "";
          }`,
                );
            const height = Math.min(500 + 100 * Math.floor(i / 5), 800);

            const chartResponse = await fetch("https://quickchart.io/chart/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chart: chartSource,
                    backgroundColor: "white",
                    height,
                    version: "4",
                    width: 800,
                }),
            });
            if (!chartResponse.ok) {
                throw new Error(
                    `Failed to create chart: ${chartResponse.status} ${chartResponse.statusText}`,
                );
            }

            const chartResult: unknown = await chartResponse.json();
            if (
                typeof chartResult !== "object" ||
                chartResult === null ||
                !("url" in chartResult) ||
                typeof chartResult.url !== "string"
            ) {
                throw new Error("QuickChart response did not include a chart URL");
            }
            embed.setImage(chartResult.url);
            embeds.push(embed);
            chunk = [];

            //}

            await interaction.editReply({
                embeds,
            });
            //const paginator = new EmbedPaginator(embeds);
            //await paginator.send(interaction);
        }
    },
};

export default command;
