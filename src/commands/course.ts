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
import { SCOTTYLABS_URL } from "../constants.js";
import type { SlashCommand } from "../types.d.ts";
import { formatCourseNumber, loadCoursesData } from "../utils/index.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("course")
        .setDescription("Get detailed information about a course")
        .addStringOption((option) =>
            option
                .setName("course_code")
                .setDescription(
                    "The course code (a two-digit number followed by a three-digit number, e.g., 15-112 or 21127)",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        const coursesData = loadCoursesData();
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
            .setURL(`https://prereqs.blejdle.christmas/?course=${course.id}`)
            .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        return interaction.reply({ embeds: [embed], components: [row] });
    },
};

export default command;
