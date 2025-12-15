import {
    bold,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import { Expr, evaluateExpr, parseExpr } from "../modules/operator-parser.ts";
import type { SlashCommand } from "../types.d.ts";

type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
};

type CourseCode = string & { __brand: "CourseCode" };

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

function loadCoursesData(): Record<CourseCode, Course> {
    const raw = CoursesData;
    const map: Record<CourseCode, Course> = {};

    for (const course of Object.values(raw)) {
        if (!course) continue;
        const key = formatCourseNumber(course.courseID);
        if (!key) continue; // this shouldn't happen since the data should be pre-validated to be correct course codes
        map[key] = course;
    }

    return map;
}

function formatCourseNumber(courseNumber: string): CourseCode | null {
    if (courseNumber.match(/^\d{2}-?\d{3}$/)) {
        if (courseNumber.includes("-")) {
            return courseNumber as CourseCode;
        } else {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(2)}` as CourseCode;
        }
    }
    return null;
}

function fetchCourseUnlocks(
    courseData: Record<CourseCode, Course>,
    courseNumber: CourseCode,
): Course[] {
    const unlocks: Course[] = [];

    for (const course of Object.values(courseData)) {
        if (course.prereqs.includes(courseNumber)) {
            unlocks.push(course);
        }
    }

    return unlocks;
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
        ),
    async execute(interaction) {
        const coursesData = loadCoursesData();

        if (interaction.options.getSubcommand() === "unlocks") {
            // TODO: think of a better type name than Course here cuz it's getting reused
            // or don't because i guess it works actually
            function lookup(value: CourseCode): Course[] {
                return fetchCourseUnlocks(coursesData, value).map(
                    (course) =>
                        ({
                            courseID: course.courseID,
                            name: course.name,
                        }) as Course,
                );
            }

            function equals(a: Course, b: Course): boolean {
                return a.courseID === b.courseID;
            }

            const courseString = interaction.options.getString(
                "courses_string",
                true,
            );

            // this isn't going to use parseAndEvaluate because I need to undergo value validation
            // TODO: figure out how to do that innately?
            const expr: Expr<CourseCode | string> = parseExpr<
                CourseCode | string
            >(courseString, (value: string) => {
                const formatted = formatCourseNumber(value);
                return formatted ? formatted : value;
            });

            // check that no course codes are null or invalid
            // by doing a recursive traversal of the expression tree
            // this is still error checking though
            // TODO: make better (maybe when I learn functional)
            function validateExpr(node: Expr<CourseCode | string>): void {
                switch (node.type) {
                    case "Literal":
                        if (/^\d{2}-\d{3}$/.test(node.value) === false) {
                            throw new Error(
                                `Something was wrong with your query. Please check your syntax and try again!`,
                            );
                        }
                        // this could be worded as just !coursesData[node.value] if I made the first if statement into a isCourseCode function
                        if (!coursesData[node.value as CourseCode]) {
                            throw new Error(
                                `Course with code ${node.value} not found.`,
                            );
                        }
                        break;
                    case "Operator":
                        validateExpr(node.left);
                        validateExpr(node.right);
                        break;
                }
            }

            try {
                validateExpr(expr);
            } catch (e) {
                return interaction.reply({
                    content: (e as Error).message,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const unlockCourses = evaluateExpr(
                expr as Expr<CourseCode>,
                lookup,
                equals,
            );

            unlockCourses.sort((a, b) => a.id.localeCompare(b.id));

            if (unlockCourses === undefined) {
                return interaction.reply({
                    content: `Something was wrong with your query. Please check your syntax and try again!`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (unlockCourses.length === 0) {
                return interaction.reply({
                    content: `No courses found that are unlocked by ${courseString}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embeds: EmbedBuilder[] = [];
            while (unlockCourses.length > 0) {
                // search up to 4096 characters for Discord embed limit
                // TODO: refactor later there's no way this is the most efficient way
                const chunk: { courseID: string; name: string }[] = [];
                let charCount = 0;

                while (
                    unlockCourses.length > 0 &&
                    charCount +
                        unlockCourses[0].courseID.length + // calculates length of this course entry
                        unlockCourses[0].name.length +
                        4 <
                        4096
                ) {
                    const course = unlockCourses.shift()!;
                    chunk.push(course);
                    charCount +=
                        course.courseID.length + course.name.length + 7;
                }

                const chunkEmbed = new EmbedBuilder()
                    .setTitle(`Courses unlocked by ${courseString} (cont.)`)
                    .setDescription(
                        chunk
                            .map(
                                (course) =>
                                    `**${course.courseID}**: ${course.name}`,
                            )
                            .join("\n"),
                    );

                embeds.push(chunkEmbed);
            }

            embeds[0].setTitle(`Courses unlocked by ${courseString}`);

            return interaction.reply({ embeds: embeds });
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
    },
};

export default command;
