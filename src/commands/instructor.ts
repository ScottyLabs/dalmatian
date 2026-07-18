import { bold, EmbedBuilder, SlashCommandBuilder, underline } from "discord.js";

import { search } from "fast-fuzzy";
import { FCE_DATA_BY_COURSE, FCE_STARTUP_CACHE } from "../utils/fceCache.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA, formatCourseNumber } from "../utils/index.ts";
import { logger } from "../utils/log.ts";

// TODO: move this to fceCache.ts probably
const ALL_INSTRUCTORS = (() => {
    const instructorsMap = new Map<string, { name: string; courseCodes: Set<string> }>();

    for (const courseData of Object.values(FCE_DATA_BY_COURSE)) {
        const courseCode = courseData.courseNum.trim();
        if (!courseCode) continue;

        for (const record of courseData.records) {
            const instructorName = record.instructor.trim();
            if (!instructorName) continue;

            const existingInstructor = instructorsMap.get(instructorName);
            if (!existingInstructor) {
                instructorsMap.set(instructorName, {
                    name: instructorName,
                    courseCodes: new Set<string>(),
                });
            }

            instructorsMap.get(instructorName)!.courseCodes.add(courseCode);
        }
    }

    return Object.fromEntries(
        Array.from(instructorsMap.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ name, courseCodes }) => [name, Array.from(courseCodes).sort()]),
    ) as Record<string, string[]>;
})();

function getAllInstructors(): Record<string, string[]> {
    return ALL_INSTRUCTORS;
}

export function resolveCourseCode(rawCourseCode: string | null | undefined): string | null {
    if (!rawCourseCode?.trim()) {
        return null;
    }

    return formatCourseNumber(rawCourseCode.trim());
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("instructor")
        .setDescription("Get detailed information about an instructor")
        .addStringOption((option) =>
            option
                .setName("instructor_name")
                .setDescription("The name of the instructor")
                .setRequired(true)
                .setAutocomplete(true),
        )
        .addStringOption((option) =>
            option
                .setName("course_code")
                .setDescription(
                    "The course code, if not provided will list all courses taught by the instructor",
                )
                .setRequired(false)
                .setAutocomplete(true),
        ),
    async execute(interaction) {
        // TODO: make this return FCE data and not the course data
        const coursesData = COURSES_DATA;
        const courseCode = resolveCourseCode(interaction.options.getString("course_code"));
        const instructor = interaction.options.getString("instructor_name", true);
        const fceData = FCE_DATA_BY_COURSE;
        const _summaryByCourseCode = FCE_STARTUP_CACHE.summaryByCourseCode;
        const _summaryByInstructorByCourseCode = FCE_STARTUP_CACHE.summaryByInstructorByCourseCode;
        const instructors = getAllInstructors();
        logger.info(`hello`);
        const baseEmbed = new EmbedBuilder().setTitle(bold(underline(`${instructor}`)));
        if (!courseCode) {
            const description = [];
            for (const course of instructors[instructor]!) {
                const _courseData = coursesData[course]!;
                const _courseFCEData = fceData[course]!;

                description.push(`${course}`);
            }

            const embed = EmbedBuilder.from(baseEmbed).setDescription(`${description.join("\n")}`);

            return interaction.reply({ embeds: [embed] });
        } else {
            const course = coursesData[courseCode]!;

            const embed = EmbedBuilder.from(baseEmbed).setDescription(
                `${bold(course.department)}\n ${course.desc}`,
            );

            return interaction.reply({ embeds: [embed] });
        }
    },
    async autocomplete(_client, interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();

        const instructors = getAllInstructors();
        const instructorNames = Object.keys(instructors);

        let choices: { name: string; value: string }[] = [];

        if (focusedOption.name === "instructor_name") {
            const filteredChoices =
                focusedValue === ""
                    ? instructorNames
                    : search(focusedValue, instructorNames, {
                          keySelector: (name) => name,
                      });
            choices = filteredChoices.slice(0, 10).map((name) => ({
                name,
                value: name,
            }));
        } else if (focusedOption.name === "course_code") {
            const selectedInstructor = interaction.options.getString("instructor_name")?.trim();
            if (selectedInstructor) {
                const courseCodes = instructors[selectedInstructor] ?? [];
                const filteredChoices =
                    focusedValue === ""
                        ? courseCodes
                        : search(focusedValue, courseCodes, {
                              keySelector: (code) => code,
                          });
                choices = filteredChoices.slice(0, 10).map((code) => ({
                    name: code,
                    value: code,
                }));
            }
        }

        await interaction.respond(choices);
    },
};

export default command;
