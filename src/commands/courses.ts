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
import type { SlashCommand } from "../types.d.ts";

type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
};

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
    const raw = CoursesData as Record<string, Course>;
    const map: Record<string, Course> = {};

    for (const courseid of Object.keys(raw)) {
        if (!raw[courseid]) continue;
        const key = formatCourseNumber(courseid) ?? courseid;
        map[key] = raw[courseid];
    }

    return map;
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

function prereqstringformatter(prereqstring: string): string | null {
    //"(21269 or 21256 or 21259 or 21268 or 21254) and (73102 or 73104 or 73100)"
    const numbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (let i = 0; i < prereqstring.length - 4; i++) {
        if (
            prereqstring.charAt(i) in numbers &&
            prereqstring.charAt(i + 1) in numbers &&
            prereqstring.charAt(i + 2) in numbers &&
            prereqstring.charAt(i + 3) in numbers &&
            prereqstring.charAt(i + 4) in numbers
        ) {
            prereqstring =
                prereqstring.slice(0, i + 2) + "-" + prereqstring.slice(i + 2);
            i++;
        }
    }
    return prereqstring;
}

function coreqjoiner(coreqs: string[]): string {
    let result: (string | null)[] = [];
    coreqs.forEach((course) => {
        result.push(formatCourseNumber(course));
    });
    return result.join(", ");
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
                        .setName("course_code")
                        .setDescription(
                            "The course code (a two-digit number followed by a three-digit number, e.g., 15-112 or 21127)",
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

            const unlockCourses: {
                id: string;
                name: string;
            }[] = [];

            for (const course of Object.values(coursesData)) {
                for (const prereq of course.prereqs) {
                    if (courseCode === prereq) {
                        unlockCourses.push({
                            id: course.id,
                            name: course.name,
                        });
                        break;
                    }
                }
            }

            unlockCourses.sort((a, b) => a.id.localeCompare(b.id));

            if (unlockCourses.length === 0) {
                return interaction.reply({
                    content: `No courses found that are unlocked by ${courseCode}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Courses unlocked by ${courseCode}`)
                .setDescription(
                    unlockCourses
                        .map((course) => `${bold(course.id)}: ${course.name}`)
                        .join("\n"),
                );

            return interaction.reply({ embeds: [embed] });
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
                        value:
                            prereqstringformatter(course.prereqString) ||
                            "None",
                        inline: true,
                    },
                    {
                        name: "Corequisites",
                        value:
                            course.coreqs.length > 0
                                ? coreqjoiner(course.coreqs)
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

                const embed = new EmbedBuilder()
                    .setTitle(`${code}: ${course.name} (${course.units} units)`)
                    .setURL(`${SCOTTYLABS_URL}/course/${code}`);

                let description =
                    `:pushpin: ${bold(underline("Aggregate Data (past 5 years)"))}\n` +
                    `Teaching: ${bold(fce.overallTeachingRate.toFixed(2))}/5 • ` +
                    `Course: ${bold(fce.overallCourseRate.toFixed(2))}/5\n` +
                    `Workload: ${bold(fce.hrsPerWeek.toFixed(2))} hrs/wk • ` +
                    `Response Rate: ${bold(`${fce.responseRate.toFixed(1)}%`)}`;

                let content = "";
                let count = 0;

                for (const [instructor, stats] of instructorMap) {
                    const section =
                        `\n\n${bold(underline(instructor.toUpperCase()))}\n` +
                        `Teaching: ${bold((stats.teachingRate / stats.count).toFixed(2))}/5 • ` +
                        `Course: ${bold((stats.courseRate / stats.count).toFixed(2))}/5\n` +
                        `Workload: ${bold((stats.workload / stats.count).toFixed(2))} hrs/wk • ` +
                        `Last taught in ${stats.lastTaught}`;

                    if (description.length + section.length > 4096) {
                        content = `:warning: ${bold("Warning:")} ${instructorMap.size - count} instructors not shown due to embed description limits`;
                        break;
                    }
                    description += section;
                    count++;
                }
                embed.setDescription(description);

                return interaction.reply({ content, embeds: [embed] });
            } else {
                let description = "";
                let totalUnits = 0;

                for (const { code, course, fce } of validCourses) {
                    const courseName = fce.courseName.toUpperCase();
                    description += `${hyperlink(`${bold(code)} (${courseName})`, `${SCOTTYLABS_URL}/course/${code}`)} = ${bold(`${fce.hrsPerWeek.toFixed(1)} hrs/wk`)}\n`;
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

                description += `Total FCE = ${bold(`${totalHours.toFixed(1)} hrs/wk`)} (${totalUnits} units)`;
                if (fywMinis.length == 2) {
                    description += `\n:pencil: ${bold("Note:")} First-year writing minis averaged`;
                }
                if (notFound.length > 0) {
                    description += `\n:warning: ${bold("Warning:")} ${notFound.length === 1 ? "Course" : "Courses"} ${notFound.join(", ")} not found`;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`FCE for ${validCourses.length} Courses`)
                    .setDescription(description);

                return interaction.reply({ embeds: [embed] });
            }
        }
    },
};

export default command;
