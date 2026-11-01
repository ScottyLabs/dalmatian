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
import { Searcher } from "fast-fuzzy";
import { FCE_STARTUP_CACHE } from "../utils/fceCache.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA } from "../utils/index.ts";
import { SCOTTYLABS_URL } from "../constants.ts";

const ALL_INSTRUCTORS = FCE_STARTUP_CACHE.summaryByCourseCodeByInstructor;

const INSTRUCTOR_NAMES = [...ALL_INSTRUCTORS.keys()];

const instructorSearcher = new Searcher(INSTRUCTOR_NAMES, {
    keySelector: (name) => {
        const [last = "", first = ""] = name.split(",").map((s) => s.trim());
        return [`${last} ${first}`, `${first} ${last}`];
    },
});

function searchInstructors(query: string): string[] {
    return instructorSearcher.search(query.replace(/,/g, " ").trim());
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

        const coursesData = COURSES_DATA;
        const instructorInput = interaction.options.getString("instructor_name", true);
        const instructor = ALL_INSTRUCTORS.has(instructorInput)
            ? instructorInput
            : (searchInstructors(instructorInput)[0] ?? instructorInput);
        const instructorCourses = ALL_INSTRUCTORS.get(instructor);
        if (!instructorCourses) {
            return interaction.reply({
                content: "No instructor data found",
                flags: MessageFlags.Ephemeral,
            });
        }

        const baseEmbed = new EmbedBuilder()
            .setTitle(bold(underline(instructor.toUpperCase())))
            .setURL(`${SCOTTYLABS_URL}/instructor/${encodeURIComponent(instructor.toUpperCase())}`);

        const pages: EmbedBuilder[] = [];
        let chunk: string[] = [];
        let index = 0;

        for (const [course, instructorSummary] of instructorCourses) {
            const courseData = coursesData[course];
            const url = `${SCOTTYLABS_URL}/course/${encodeURIComponent(course)}`;

            const entry = createFCEEntry(
                hyperlink(`${course}: ${courseData?.name ?? "Unknown Course"}`, url),
                instructorSummary.semesterLabels,
                instructorSummary.teachingRate,
                instructorSummary.courseRate,
                instructorSummary.workload,
                instructorSummary.responseRate,
            );
            chunk.push(entry);
            index++;

            if (chunk.length >= 5 || index === instructorCourses.size) {
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
        const focusedValue = focusedOption.value;

        if (focusedOption.name === "instructor_name") {
            const filteredChoices =
                focusedValue === "" ? INSTRUCTOR_NAMES : searchInstructors(focusedValue);
            const choices = filteredChoices.slice(0, 10).map((name) => ({
                name: name.toUpperCase(),
                value: name,
            }));
            await interaction.respond(choices);
        }
    },
};

export default command;
