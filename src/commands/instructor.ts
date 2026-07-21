import {
    bold,
    EmbedBuilder,
    SlashCommandBuilder,
    underline,
    hyperlink,
    italic,
    MessageFlags,
} from "discord.js";

import { search } from "fast-fuzzy";
import { FCE_DATA_BY_COURSE, FCE_STARTUP_CACHE } from "../utils/fceCache.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA, formatCourseNumber } from "../utils/index.ts";
import { SCOTTYLABS_URL } from "../constants.ts";

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
        ),
    async execute(interaction) {
        function joinAndTruncate(items: string[], max = 7, buffer = 2): string {
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
        function semesterLabelToNum(semLabel: string): number {
            const sem = semLabel.slice(0, 1);
            const year = parseInt(semLabel.slice(1));
            if (sem === "F") {
                return year + 0.6;
            } else if (sem === "M") {
                return year + 0.3;
            }
            return year;
        }
        const coursesData = COURSES_DATA;
        const instructor = interaction.options.getString("instructor_name", true);
        const fceData = FCE_DATA_BY_COURSE;
        const _summaryByCourseCode = FCE_STARTUP_CACHE.summaryByCourseCode;
        const summaryByInstructorByCourseCode = FCE_STARTUP_CACHE.summaryByInstructorByCourseCode;
        const instructors = getAllInstructors();
        const instructorCourses = instructors[instructor];
        if (!instructorCourses) {
            return interaction.reply({
                content: "Something went wrong",
                flags: MessageFlags.Ephemeral,
            });
        }

        //sort in descending order so more recently taught courses show up first
        instructorCourses.sort(
            (a, b) =>
                semesterLabelToNum(
                    summaryByInstructorByCourseCode.get(b)?.get(instructor)?.semesterLabels[0]!,
                ) -
                semesterLabelToNum(
                    summaryByInstructorByCourseCode.get(a)?.get(instructor)?.semesterLabels[0]!,
                ),
        );
        const baseEmbed = new EmbedBuilder()
            .setTitle(bold(underline(`${instructor}`)))
            .setURL(`${SCOTTYLABS_URL}/instructor/${encodeURIComponent(instructor)}`);

        //TODO: add pagination
        const description = [];

        for (const course of instructors[instructor]!) {
            const courseData = coursesData[course]!;
            const _courseFCEData = fceData[course]!;
            const instructorSummary = summaryByInstructorByCourseCode.get(course)?.get(instructor);
            if (!instructorSummary) {
                return interaction.reply({
                    content: "Something went wrong",
                    flags: MessageFlags.Ephemeral,
                });
            }
            const url = `${SCOTTYLABS_URL}/course/${encodeURIComponent(course)}`;

            description.push(
                createFCEEntry(
                    hyperlink(`${course}: ${courseData.name}`, url),
                    instructorSummary.semesterLabels,
                    instructorSummary.teachingRate,
                    instructorSummary.courseRate,
                    instructorSummary.workload,
                    instructorSummary.responseRate,
                ),
            );
        }
        const embed = EmbedBuilder.from(baseEmbed).setDescription(`${description.join("\n \n")}`);

        return interaction.reply({ embeds: [embed] });
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
