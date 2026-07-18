import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    bold,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import { SCOTTYLABS_URL } from "../constants.ts";
import { search } from "fast-fuzzy";
import { FCE_DATA_BY_COURSE } from "../utils/fceCache.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA, formatCourseNumber } from "../utils/index.ts";

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
        const courseCode = formatCourseNumber(interaction.options.getString("course_code", true));

        if (!courseCode) {
            return interaction.reply({
                content: "Please provide a valid course code in the format XX-XXX or XXXXX.",
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
            .setTitle(bold(underline(`${course.id}: ${course.name}`)) + ` (${course.units} units)`)
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
                    value: course.coreqs.length > 0 ? course.coreqs.join(", ") : "None",
                    inline: true,
                },
            );

        const button = new ButtonBuilder()
            .setLabel("View prerequisite graph")
            .setURL(`https://prereqs.blejdle.christmas/?course=${course.id}`)
            .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        return interaction.reply({ embeds: [embed], components: [row] });
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
