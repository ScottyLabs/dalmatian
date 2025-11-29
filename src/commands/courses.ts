import {
    bold,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import CoursesData from "../data/courses.json" with { type: "json" };
import { parseAndEvaluate } from "../modules/operator-parser.ts";
import type { Command } from "../types.d.ts";

type Course = {
    _id: {
        $oid: string;
    };
    courseID: string;
    desc: string;
    prereqs: string[];
    prereqString: string;
    coreqs: string[];
    crosslisted: string[];
    name: string;
    units: string;
    department: string;
    numTerms: number;
};

function loadCoursesData(): Record<string, Course> {
    const raw = CoursesData as Record<string, Course>;
    const map: Record<string, Course> = {};

    for (const course of Object.values(raw)) {
        if (!course) continue;
        const key = formatCourseNumber(course.courseID) ?? course.courseID;
        map[key] = course;
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

const command: Command = {
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
            function lookup(value: string): Course[] {
                const courseCode = formatCourseNumber(value);

                if (!courseCode) {
                    throw Error(
                        `Please provide a valid course code in the format XX-XXX or XXXXX.`,
                    );
                }

                if (!coursesData[courseCode]) {
                    throw Error(`Course with code ${courseCode} not found.`);
                }

                return fetchCourseUnlocks(coursesData, courseCode).map(
                    (course) => ({
                        courseID: course.courseID,
                        name: course.name,
                    }),
                );
            }

            const courseString = interaction.options.getString(
                "courses_string",
                true,
            );

            const unlockCourses = parseAndEvaluate<Course>(
                courseString,
                lookup,
            );
            /*.catch((err) => {
                return interaction.reply({
                    content: err.message,
                    flags: MessageFlags.Ephemeral,
                });
            });*/

            unlockCourses.sort((a, b) => a.courseID.localeCompare(b.courseID));

            if (unlockCourses.length === 0) {
                return interaction.reply({
                    content: `No courses found that are unlocked by ${courseString}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Courses unlocked by ${courseString}`)
                .setDescription(
                    unlockCourses
                        .map(
                            (course) =>
                                `**${course.courseID}**: ${course.name}`,
                        )
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
                    bold(underline(`${course.courseID}: ${course.name}`)) +
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
    },
};

export default command;
