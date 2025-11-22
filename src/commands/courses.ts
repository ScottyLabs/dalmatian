import {
    bold,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import CoursesData from "../data/finalCourseJSON.json" with {type: "json"};
import type {Command} from "../types.d.ts";

type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
}

type Course = {
    id: string;
    name: string;
    syllabi: Session[]
    desc: string;
    prereqs: string[];
    prereqString: string;
    coreqs: string[];
    crosslisted: string[];
    units: string;
    department: string;
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
                        .map(
                            (course) =>
                                `**${course.id}**: ${course.name}`,
                        )
                        .join("\n"),
                );

            return interaction.reply({embeds: [embed]});
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

            return interaction.reply({embeds: [embed]});
        }
    },
};

export default command;
