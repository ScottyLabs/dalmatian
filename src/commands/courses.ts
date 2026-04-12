import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import {
    ActionRowBuilder,
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
import SyllabiData from "../data/course-api.syllabi.json" with { type: "json" };
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import { parseAndEvaluate } from "../modules/operator-parser.ts";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { Course } from "../utils/index.ts";

//TODO: many of these fields could be made into CourseCodes

type FCEData = {
    courseNum: string;
    courseName: string;
    aggregateTeachingRate: number;
    aggregateCourseRate: number;
    aggregateHrsPerWeek: number;
    aggregateSemesterLabels: string[];
    responseRate: number;
    count: number;
    records: FCERecord[];
};

type FCERecord = {
    section: string;
    instructor: string;
    hrsPerWeek: number;
    overallTeachingRate: number;
    overallCourseRate: number;
    responseRate: number;
    semesterLabel: string;
};

type Syllabus = {
    _id: {
        $oid: string;
    };
    season: string;
    year: number;
    number: string;
    section: string;
    url: string;
};

function loadCoursesData(): Record<string, Course> {
    return CoursesData as Record<string, Course>;
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

function abbrevSemester(semester: string): string {
    const normalized = semester.trim().toLowerCase();
    if (normalized === "fall") {
        return "F";
    }
    if (normalized === "spring") {
        return "S";
    }
    if (normalized === "summer") {
        return "M";
    }
    return "?";
}

function formatSemesterLabel(semester: string, year: number): string {
    const tag = abbrevSemester(semester);
    return `${tag}${String(year).slice(-2)}`;
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

        // Only consider FCEs from the past 5 years
        if (year < cutoffYear) continue;

        const formattedCode = formatCourseNumber(num)!;
        const semesterLabel = formatSemesterLabel(semester!, year);

        const hrsPerWeek = parseFloat(record["Hrs Per Week"] ?? "");
        const overallTeachingRate = parseFloat(
            record["Overall teaching rate"] ?? "",
        );
        const overallCourseRate = parseFloat(
            record["Overall course rate"] ?? "",
        );
        const responseRate = parseFloat(record["Response Rate"] ?? "");

        if (!fceMap[formattedCode]) {
            const courseName = record["Course Name"] ?? "";
            fceMap[formattedCode] = {
                courseNum: formattedCode,
                courseName: courseName,
                aggregateTeachingRate: 0,
                aggregateCourseRate: 0,
                aggregateHrsPerWeek: 0,
                aggregateSemesterLabels: [],
                responseRate: 0,
                count: 0,
                records: [],
            };
        }

        const instructor = record["Instructor"] ?? "";
        const section = record["Section"] ?? "";

        fceMap[formattedCode].records.push({
            section,
            instructor,
            hrsPerWeek,
            semesterLabel,
            overallTeachingRate,
            overallCourseRate,
            responseRate,
        });

        if (semester && !semester.toLowerCase().includes("summer")) {
            fceMap[formattedCode].aggregateTeachingRate += overallTeachingRate;
            fceMap[formattedCode].aggregateCourseRate += overallCourseRate;
            fceMap[formattedCode].aggregateHrsPerWeek += hrsPerWeek;
            fceMap[formattedCode].responseRate += responseRate;
            fceMap[formattedCode].aggregateSemesterLabels.push(semesterLabel);
            fceMap[formattedCode].count++;
        }
    }

    for (const courseCode in fceMap) {
        const data = fceMap[courseCode];
        if (!data) continue;
        data.aggregateTeachingRate = data.aggregateTeachingRate / data.count;
        data.aggregateCourseRate = data.aggregateCourseRate / data.count;
        data.aggregateHrsPerWeek = data.aggregateHrsPerWeek / data.count;
        data.responseRate = data.responseRate / data.count;
    }

    return fceMap;
}

function loadSyllabiData(): Record<string, Syllabus[]> {
    const syllabiData = SyllabiData as Syllabus[];
    const syllabi: Record<string, Syllabus[]> = {};

    const seasonOrder: Record<string, number> = {
        F: 0,
        S: 1,
        M: 2,
        N: 3, // retained for compatability with summers before 2026
    };

    for (const entry of syllabiData) {
        const courseid = formatCourseNumber(entry.number) ?? "";
        if (!syllabi[courseid]) {
            syllabi[courseid] = [];
        }
        syllabi[courseid].push(entry);
    }

    for (const courseid in syllabi) {
        syllabi[courseid]!.sort((a, b) => {
            if (a.year !== b.year) {
                return b.year - a.year;
            }

            return (
                (seasonOrder[a.season] ?? 99) - (seasonOrder[b.season] ?? 99)
            );
        });
    }

    return syllabi;
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
                            "Course codes separated by spaces or commas (e.g., 15-112 21-127,15-122)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("syllabus")
                .setDescription("Get pdfs of syllabi for a course")
                .addStringOption((option) =>
                    option
                        .setName("course_id")
                        .setDescription(
                            "Course code in XX-XXX or XXXXX format (e.g., 15-112)",
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

            function universe(): Course[] {
                return Object.values(coursesData).map(
                    (course) =>
                        ({
                            id: course.id,
                            name: course.name,
                        }) as Course,
                );
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
                        if (!value.match(/^\d{2}(-| )?\d{3}$/)) {
                            throw new Error(`Unexpected token: ${value}`);
                        }
                        return value;
                    },
                    lookup,
                    equals,
                    universe,
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
                        .map((course) =>
                            hyperlink(
                                `${bold(course!.id)}: ${course!.name}`,
                                `${SCOTTYLABS_URL}/course/${course!.id}`,
                            ),
                        )
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

            const paginator = new EmbedPaginator({ pages: embeds });
            await paginator.send(interaction);
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
                .setURL(`${SCOTTYLABS_URL}/course/${course.id}`)
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

            const button = new ButtonBuilder()
                .setLabel("View prerequisite graph")
                .setURL(
                    `https://prereqs.blejdle.christmas/?course=${course.id}`,
                )
                .setStyle(ButtonStyle.Link);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                button,
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }
        if (interaction.options.getSubcommand() === "fce") {
            const input = interaction.options.getString("course_codes", true);
            const rawCodes = input
                .split(/[\s,]+/)
                .filter((code) => code.trim());

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
                    semesters: Set<string>;
                };

                type IndividualFCE = {
                    teachingRate: number;
                    courseRate: number;
                    workload: number;
                    responseRate: number;
                    instructor: string;
                    semesterLabel: string;
                };

                const instructorMap = new Map<string, InstructorFCE>();
                const allFCEs: IndividualFCE[] = [];

                for (const record of fce.records) {
                    const instructor = record.instructor;
                    if (!instructorMap.has(instructor)) {
                        instructorMap.set(instructor, {
                            teachingRate: 0,
                            courseRate: 0,
                            workload: 0,
                            responseRate: 0,
                            count: 0,
                            semesters: new Set<string>(),
                        });
                    }
                    const stats = instructorMap.get(instructor)!;
                    stats.teachingRate += record.overallTeachingRate;
                    stats.courseRate += record.overallCourseRate;
                    stats.workload += record.hrsPerWeek;
                    stats.responseRate += record.responseRate;
                    stats.count++;
                    stats.semesters.add(record.semesterLabel);

                    allFCEs.push({
                        teachingRate: record.overallTeachingRate,
                        courseRate: record.overallCourseRate,
                        workload: record.hrsPerWeek,
                        responseRate: record.responseRate,
                        instructor: record.instructor,
                        semesterLabel: record.semesterLabel,
                    });
                }

                const baseEmbed = new EmbedBuilder()
                    .setTitle(
                        `${underline(`${code}: ${course.name}`)} (${course.units} units)`,
                    )
                    .setURL(`${SCOTTYLABS_URL}/course/${code}`);

                function joinAndTruncate(
                    items: string[],
                    limit: number,
                ): string {
                    if (items.length <= limit) {
                        return items.join(", ");
                    }

                    const visibleItems = items.slice(0, limit).join(", ");
                    const remainingCount = items.length - limit;

                    return `${visibleItems}, and ${remainingCount} more...`;
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
                        `${bold(title)} ${italic(`(${joinAndTruncate(semesterLabels, 8)})`)}\n` +
                        `Teaching: ${bold(teachingRate.toFixed(2))}/5 • ` +
                        `Course: ${bold(courseRate.toFixed(2))}/5\n` +
                        `Workload: ${bold(workload.toFixed(2))} hrs/wk • ` +
                        `Response Rate: ${bold(`${responseRate.toFixed(1)}%`)}`
                    );
                }

                const summaryPage = EmbedBuilder.from(baseEmbed)
                    .setDescription(
                        createFCEEntry(
                            "Aggregate Data",
                            fce.aggregateSemesterLabels,
                            fce.aggregateTeachingRate,
                            fce.aggregateCourseRate,
                            fce.aggregateHrsPerWeek,
                            fce.responseRate,
                        ),
                    )
                    .setFooter({ text: "Excluding summers" });

                const byInstructorEntries = [...instructorMap.entries()].map(
                    ([instructor, stats]) => {
                        const name = instructor.toUpperCase();
                        const url = `${SCOTTYLABS_URL}/instructor/${encodeURIComponent(name)}`;
                        const semesters = [...stats.semesters];
                        return createFCEEntry(
                            hyperlink(name, url),
                            semesters,
                            stats.teachingRate / stats.count,
                            stats.courseRate / stats.count,
                            stats.workload / stats.count,
                            stats.responseRate / stats.count,
                        );
                    },
                );

                const allSemesterEntries = allFCEs.map((stats) => {
                    const name = stats.instructor.toUpperCase();
                    const url = `${SCOTTYLABS_URL}/instructor/${encodeURIComponent(name)}`;

                    return createFCEEntry(
                        hyperlink(name, url),
                        [stats.semesterLabel],
                        stats.teachingRate,
                        stats.courseRate,
                        stats.workload,
                        stats.responseRate,
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

                const selectOptions = [
                    {
                        label: "Summary",
                        value: "summary",
                        default: true,
                        pages: [summaryPage],
                    },
                    {
                        label: "By Instructor",
                        value: "by_instructor",
                        pages: buildFCEPages(byInstructorEntries),
                    },
                    {
                        label: "All Semesters",
                        value: "all_semesters",
                        pages: buildFCEPages(allSemesterEntries),
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
                    async onCollect(interaction) {
                        if (interaction.isStringSelectMenu()) {
                            const choice = interaction.values[0]!;
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
                        }
                    },
                });
                await paginator.send(interaction);
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
                let unitIssuePostFixer = "";
                for (const { code, course, fce } of validCourses) {
                    const courseName = fce.courseName.toUpperCase();
                    description +=
                        formatLine(
                            fce.aggregateHrsPerWeek,
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
                    (sum, { fce }) => sum + fce.aggregateHrsPerWeek,
                    0,
                );
                const fywMinis = validCourses.filter(({ code }) =>
                    FYW_MINIS.includes(code),
                );
                if (fywMinis.length == 2) {
                    const miniWorkload =
                        fywMinis[0]!.fce.aggregateHrsPerWeek +
                        fywMinis[1]!.fce.aggregateHrsPerWeek;
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
                        `FCE for ${validCourses.length} Courses (${totalUnits.toFixed(1)}${unitIssuePostFixer} units)`,
                    )
                    .setDescription(description);
                //Converts list of courses into a string, and then embeds that as a link button in the bottom row.
                const courseList = validCourses
                    .map(({ code }) => code)
                    .join(",");
                const url =
                    `http://courses.scottylabs.org/schedules/shared?courses=` +
                    courseList;
                const button = new ButtonBuilder()
                    .setLabel("View schedule")
                    .setURL(url)
                    .setStyle(ButtonStyle.Link);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    button,
                );
                return interaction.reply({
                    embeds: [embed],
                    components: [row],
                });
            }
        }
        if (interaction.options.getSubcommand() === "syllabus") {
            const syllabi = loadSyllabiData();
            const fceData = loadFCEData();

            const courseid = formatCourseNumber(
                interaction.options.getString("course_id", true),
            );

            if (!courseid) {
                return interaction.reply({
                    content:
                        "Please provide a valid course code in the format XX-XXX or XXXXX.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const course = coursesData[courseid];

            if (!syllabi[courseid] || !course) {
                return interaction.reply({
                    content: `Course ${courseid} not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            let foundSyllabi = syllabi[courseid];

            const uniqueSyllabi = [
                ...new Map(foundSyllabi.map((s) => [s.url, s])).values(),
            ];

            const embeds: EmbedBuilder[] = [];
            let currentDesc = "";

            let links = 0;

            for (const syllabus of uniqueSyllabi) {
                /*
                Currently this uses fce data to find instructor data
                However, syllabi data should be updated to include instructor,
                and courses data should be changed to correctly include
                syllabi and session as intended
                */

                let fceRec = fceData[courseid]?.records ?? [];
                let fceEntry = undefined;

                for (const rec of fceRec) {
                    if (
                        rec.section == syllabus.section &&
                        (rec.semesterLabel ==
                            `${syllabus.season}${syllabus.year}` ||
                            (syllabus.season == "N" &&
                                rec.semesterLabel == `M${syllabus.year}`))
                        // edge-case: syllabi summers before 2026 can start with M or N, but FCE data always start with M
                    ) {
                        fceEntry = rec;
                    }
                }
                const line: string = hyperlink(
                    `${syllabus.season}${syllabus.year}: ${syllabus.number}-${syllabus.section} ${fceEntry?.instructor ? `(${fceEntry?.instructor})` : ""} \n`,
                    `${syllabus.url}`,
                );
                if (links >= 20) {
                    embeds.push(
                        new EmbedBuilder()
                            .setTitle(`Syllabi for ${courseid}: ${course.name}`)
                            .setURL(`${SCOTTYLABS_URL}/course/${courseid}`)
                            .setDescription(currentDesc),
                    );
                    currentDesc = line;
                    links = 1;
                } else {
                    currentDesc += line;
                    links++;
                }
            }

            if (currentDesc) {
                embeds.push(
                    new EmbedBuilder()
                        .setTitle(`Syllabi for ${courseid}: ${course.name}`)
                        .setURL(`${SCOTTYLABS_URL}/course/${courseid}`)
                        .setDescription(currentDesc),
                );
            }

            return new EmbedPaginator({ pages: embeds }).send(interaction);
        }
    },
};

export default command;
