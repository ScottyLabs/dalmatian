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
import { FYW_MINIS, SCOTTYLABS_URL } from "../constants.js";
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import { parseAndEvaluate } from "../modules/operator-parser.ts";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";

type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
};

//TODO: many of these fields could be made into CourseCodes
type Course = {
    id: string;
    name: string;
    syllabi: Session[];
    desc: string;
    prereqs: string[];
    prereqString: string;
    coreqs: string[];
    crosslisted: string[];
    units: string;
    department: string;
};

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
};

function loadCoursesData(): Record<string, Course> {
    return CoursesData as Record<string, Course>;
}

function formatCourseNumber(courseNumber: string): string | null {
    if (courseNumber.match(/^\d{2}-?\d{3}$/)) {
        if (courseNumber.includes("-")) {
            return courseNumber;
        } else {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(2)}`;
        }
    }

    return null;
}

function fetchCourseUnlocks(
    courseData: Record<string, Course>,
    courseNumber: string,
): Course[] {
    const unlocks: Course[] = [];

    for (const course of Object.values(courseData)) {
        if (course.prereqs.includes(courseNumber)) {
            unlocks.push(course);
        }
    }

    return unlocks;
}

function loadFCEData(): Record<string, FCEData> {
    const fceMap: Record<string, FCEData> = {};
    const csvPath = join(__dirname, "../data/fce_data.csv");
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

        // Skip summer semesters
        if (semester && semester.toLowerCase().includes("summer")) continue;

        // Only consider FCEs from the past 5 years
        if (year < cutoffYear) continue;

        const formattedCode = formatCourseNumber(num)!;

        const hrsPerWeek = parseFloat(record["Hrs Per Week"] ?? "");
        const overallTeachingRate = parseFloat(
            record["Overall teaching rate"] ?? "",
        );
        const overallCourseRate = parseFloat(
            record["Overall course rate"] ?? "",
        );
        const responseRate = parseFloat(record["Response Rate"] ?? "");

        if (
            isNaN(hrsPerWeek) ||
            isNaN(overallTeachingRate) ||
            isNaN(overallCourseRate)
        )
            continue;

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
        });

        fceMap[formattedCode].overallTeachingRate += overallTeachingRate;
        fceMap[formattedCode].overallCourseRate += overallCourseRate;
        fceMap[formattedCode].hrsPerWeek += hrsPerWeek;
        fceMap[formattedCode].responseRate += responseRate;
        fceMap[formattedCode].count++;
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

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("courses")
        .setDescription("Get information about courses offered at CMU")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("unlocks")
                .setDescription("Shows all the courses a course unlocks")
                .addStringOption((option) =>
                    option
                        .setName("courses_string")
                        .setDescription(
                            "The course code (e.g., 15-112 or 21127), optionally combined with AND/OR operators",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("course-info")
                .setDescription("Get detailed information about a course")
                .addStringOption((option) =>
                    option
                        .setName("course_code")
                        .setDescription(
                            "The course code (a two-digit number followed by a three-digit number, e.g., 15-112 or 21127)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("fce")
                .setDescription("Get average FCE ratings for courses")
                .addStringOption((option) =>
                    option
                        .setName("course_codes")
                        .setDescription(
                            "Course codes separated by spaces (e.g., 15-112 21-127 15-122)",
                        )
                        .setRequired(true),
                ),
        ),
    async execute(interaction) {
        const coursesData = loadCoursesData();

        if (interaction.options.getSubcommand() === "unlocks") {
            // TODO: think of a better type name than Course here cuz it's getting reused
            // or don't because i guess it works actually
            function lookup(value: string): Course[] {
                const courseCode = formatCourseNumber(value);

                if (!courseCode) {
                    throw new Error(`Invalid course code: ${value}`);
                }

                if (!coursesData[courseCode]) {
                    throw new Error(`Course not found: ${courseCode}`);
                }

                return fetchCourseUnlocks(coursesData, courseCode).map(
                    (course) =>
                        ({
                            id: course.id,
                            name: course.name,
                        }) as Course,
                );
            }

            function equals(a: Course, b: Course): boolean {
                return a.id === b.id;
            }

            const courseString = interaction.options.getString(
                "courses_string",
                true,
            );

            let unlockCourses: Course[];
            try {
                unlockCourses = parseAndEvaluate<string, Course>(
                    courseString,
                    (value) => {
                        // this is bad code because it is no longer a black box
                        if (!value.match(/^\d{2}-?\d{3}$/)) {
                            throw new Error(`Unexpected token: ${value}`);
                        }
                        return value;
                    },
                    lookup,
                    equals,
                );
            } catch (error) {
                return interaction.reply({
                    content: `${(error as Error).message}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            unlockCourses.sort((a, b) => a.id.localeCompare(b.id));

            if (unlockCourses.length === 0) {
                return interaction.reply({
                    content: `No courses found that have the prerequisite ${courseString}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embeds = [];
            let chunk = [];
            while (unlockCourses.length > 0) {
                chunk.push(unlockCourses.shift());
                if (chunk.length >= 20 || unlockCourses.length == 0) {
                    const description = chunk
                        .map((course) => `${bold(course!.id)}: ${course!.name}`)
                        .join("\n");
                    const embed = new EmbedBuilder()
                        .setTitle(
                            `Courses with the prerequisite ${underline(courseString)}`,
                        )
                        .setDescription(description);
                    embeds.push(embed);
                    chunk = [];
                }
            }

            const paginator = new EmbedPaginator(embeds);
            paginator.send(interaction);
        }
        if (interaction.options.getSubcommand() === "course-info") {
            const courseCode = formatCourseNumber(
                interaction.options.getString("course_code", true),
            );

            if (!courseCode) {
                return interaction.reply({
                    content:
                        "Please provide a valid course code in the format XX-XXX or XXXXX.",
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

            const embed = new EmbedBuilder()
                .setTitle(
                    bold(underline(`${course.id}: ${course.name}`)) +
                        ` (${course.units} units)`,
                )
                .setDescription(`${bold(course.department)}\n ${course.desc}`)
                .addFields(
                    {
                        name: "Prerequisites",
                        value: course.prereqString || "None",
                        inline: true,
                    },
                    {
                        name: "Corequisites",
                        value:
                            course.coreqs.length > 0
                                ? course.coreqs.join(", ")
                                : "None",
                        inline: true,
                    },
                );

            return interaction.reply({ embeds: [embed] });
        }
        if (interaction.options.getSubcommand() === "fce") {
            const input = interaction.options.getString("course_codes", true);
            const rawCodes = input.split(/\s+/).filter((code) => code.trim());

            if (rawCodes.length === 0) {
                return interaction.reply({
                    content: "Please provide at least one course code.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (rawCodes.length > 10) {
                return interaction.reply({
                    content: "Please provide no more than 10 courses at once.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            type ValidCourse = {
                code: string;
                course: Course;
                fce: FCEData;
            };

            const fceData = loadFCEData();
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

                type InstructorFCE = {
                    teachingRate: number;
                    courseRate: number;
                    workload: number;
                    responseRate: number;
                    count: number;
                    lastTaught: string;
                };

                const instructorMap = new Map<string, InstructorFCE>();

                for (const record of fce.records) {
                    const instructor = record.instructor;
                    if (!instructorMap.has(instructor)) {
                        instructorMap.set(instructor, {
                            teachingRate: 0,
                            courseRate: 0,
                            workload: 0,
                            responseRate: 0,
                            count: 0,
                            lastTaught: `${record.semester} ${record.year}`,
                        });
                    }
                    const stats = instructorMap.get(instructor)!;
                    stats.teachingRate += record.overallTeachingRate;
                    stats.courseRate += record.overallCourseRate;
                    stats.workload += record.hrsPerWeek;
                    stats.count++;
                }

                const embeds = [];
                let chunk = [
                    `:pushpin: ${bold(underline("Aggregate Data (past 5 years)"))}\n` +
                        `Teaching: ${bold(fce.overallTeachingRate.toFixed(2))}/5 • ` +
                        `Course: ${bold(fce.overallCourseRate.toFixed(2))}/5\n` +
                        `Workload: ${bold(fce.hrsPerWeek.toFixed(2))} hrs/wk • ` +
                        `Response Rate: ${bold(`${fce.responseRate.toFixed(1)}%`)}`,
                ];
                let i = 0;
                for (const [instructor, stats] of instructorMap) {
                    chunk.push(
                        `${bold(underline(instructor.toUpperCase()))}\n` +
                            `Teaching: ${bold((stats.teachingRate / stats.count).toFixed(2))}/5 • ` +
                            `Course: ${bold((stats.courseRate / stats.count).toFixed(2))}/5\n` +
                            `Workload: ${bold((stats.workload / stats.count).toFixed(2))} hrs/wk • ` +
                            `Last taught in ${stats.lastTaught}`,
                    );
                    i++;
                    if (chunk.length >= 5 || i == instructorMap.size) {
                        const description = chunk.join("\n\n");
                        const embed = new EmbedBuilder()
                            .setTitle(
                                `${code}: ${course.name} (${course.units} units)`,
                            )
                            .setURL(`${SCOTTYLABS_URL}/course/${code}`)
                            .setDescription(description);
                        embeds.push(embed);
                        chunk = [];
                    }
                }

                const paginator = new EmbedPaginator(embeds);
                paginator.send(interaction);
            } else {
                function formatLine(
                    workload: number,
                    text: string,
                    total = false,
                ) {
                    let left = `${bold(workload.toFixed(1))} hrs/wk`;
                    let right = text;
                    if (total) {
                        left = underline(left);
                        right = underline(right);
                    }
                    if (workload.toFixed(1).length == 3) {
                        return left + " — " + right; // em dash
                    }
                    return left + " - " + right;
                }

                let description = "";
                let totalUnits = 0;

                for (const { code, course, fce } of validCourses) {
                    const courseName = fce.courseName.toUpperCase();
                    description +=
                        formatLine(
                            fce.hrsPerWeek,
                            hyperlink(
                                `${bold(code)} (${courseName})`,
                                `${SCOTTYLABS_URL}/course/${code}`,
                            ),
                        ) + "\n";
                    totalUnits += Number(course.units);
                }

                let totalHours = validCourses.reduce(
                    (sum, { fce }) => sum + fce.hrsPerWeek,
                    0,
                );
                const fywMinis = validCourses.filter(({ code }) =>
                    FYW_MINIS.includes(code),
                );

                if (fywMinis.length == 2) {
                    const miniWorkload =
                        fywMinis[0]!.fce.hrsPerWeek +
                        fywMinis[1]!.fce.hrsPerWeek;
                    const miniAvg = miniWorkload / 2;
                    totalHours -= miniWorkload;
                    totalHours += miniAvg;
                }

                description += formatLine(totalHours, bold("Total FCE"), true);
                if (fywMinis.length == 2) {
                    description += `\n:pencil: ${bold("Note:")} First-year writing minis averaged`;
                }
                if (notFound.length > 0) {
                    description += `\n:warning: ${bold("Warning:")} ${notFound.length === 1 ? "Course" : "Courses"} ${notFound.join(", ")} not found`;
                }

                const embed = new EmbedBuilder()
                    .setTitle(
                        `FCE for ${validCourses.length} Courses (${totalUnits.toFixed(1)} units)`,
                    )
                    .setDescription(description);

                return interaction.reply({ embeds: [embed] });
            }
        }
    },
};

export default command;
