import {
    bold,
    EmbedBuilder,
    SlashCommandBuilder,
    underline,
    hyperlink,
    italic,
    MessageFlags,
} from "discord.js";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { search } from "fast-fuzzy";
import { FCE_DATA_BY_COURSE, FCE_STARTUP_CACHE } from "../utils/fceCache.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA } from "../utils/index.ts";
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

        const coursesData = COURSES_DATA;
        const instructor = interaction.options.getString("instructor_name", true);
        const summaryByInstructorByCourseCode = FCE_STARTUP_CACHE.summaryByInstructorByCourseCode;
        const instructorCourses = ALL_INSTRUCTORS[instructor];
        if (!instructorCourses) {
            return interaction.reply({
                content: "No instructor data found",
                flags: MessageFlags.Ephemeral,
            });
        }

        const baseEmbed = new EmbedBuilder()
            .setTitle(bold(underline(`${instructor}`)))
            .setURL(`${SCOTTYLABS_URL}/instructor/${encodeURIComponent(instructor)}`);

        const pages: EmbedBuilder[] = [];
        let chunk: string[] = [];
        let index = 0;

        for (const course of ALL_INSTRUCTORS[instructor]!) {
            const courseData = coursesData[course]!;
            const instructorSummary = summaryByInstructorByCourseCode.get(course)?.get(instructor);
            if (!instructorSummary) {
                return interaction.reply({
                    content: "No instructor summary data found",
                    flags: MessageFlags.Ephemeral,
                });
            }
            const url = `${SCOTTYLABS_URL}/course/${encodeURIComponent(course)}`;

            const entry = createFCEEntry(
                hyperlink(`${course}: ${courseData.name}`, url),
                instructorSummary.semesterLabels,
                instructorSummary.teachingRate,
                instructorSummary.courseRate,
                instructorSummary.workload,
                instructorSummary.responseRate,
            );
            chunk.push(entry);
            index++;

            if (chunk.length >= 5 || index === ALL_INSTRUCTORS[instructor]!.length) {
                const embed = EmbedBuilder.from(baseEmbed).setDescription(chunk.join("\n\n"));
                pages.push(embed);
                chunk = [];
            }
        }

        const paginator = new EmbedPaginator({ pages });
        await paginator.send(interaction);
    },
    async autocomplete(_client, interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();

        const instructorNames = Object.keys(ALL_INSTRUCTORS);

        if (focusedOption.name === "instructor_name") {
            const filteredChoices =
                focusedValue === ""
                    ? instructorNames
                    : search(focusedValue, instructorNames, {
                          keySelector: (name) => name,
                      });
            const choices = filteredChoices.slice(0, 10).map((name) => ({
                name,
                value: name,
            }));
            await interaction.respond(choices);
        }
    },
};

export default command;
