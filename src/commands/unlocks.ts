import {
    bold,
    EmbedBuilder,
    hyperlink,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import { SCOTTYLABS_URL } from "../constants.js";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { COURSES_DATA, Course, formatCourseNumber } from "../utils/index.ts";
import { parseAndEvaluate } from "../utils/operatorParser.ts";

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

const command: SlashCommand = {
    data: new SlashCommandBuilder()
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
    async execute(interaction) {
        const coursesData = COURSES_DATA;

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
            if (chunk.length >= 20 || unlockCourses.length === 0) {
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
    },
};

export default command;
