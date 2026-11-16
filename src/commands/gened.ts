import {
    ActionRowBuilder,
    bold,
    EmbedBuilder,
    hyperlink,
    italic,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    underline,
} from "discord.js";
import { search } from "fast-fuzzy";

import { SCOTTYLABS_URL } from "../constants.ts";
import CITData from "../data/geneds/cit.json" with { type: "json" };
import DCData from "../data/geneds/dietrich.json" with { type: "json" };
import MCSData from "../data/geneds/mcs.json" with { type: "json" };
import SCSData from "../data/geneds/scs.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { COURSES_DATA } from "../utils/index.ts";
import { FCE_STARTUP_CACHE } from "../utils/fceCache.ts";

type Gened = {
    courseID: string;
    school: string;
    tags: string[];
    lastUpdated: string;
};
const schools = ["CIT", "DC", "SCS", "MCS"];
const CITtags = [
    "Free Elective Only",
    "General Education Elective",
    "Innovation & Internationalization",
    "People, Places, & Cultures",
    "Social Analysis & Decision Making",
    "Writing & Expression",
];
const DCtags = [
    "Additional Disciplines",
    "Communication",
    "Computational Thinking",
    "Contextual Thinking",
    "Data Analysis",
    "Grand Challenge Seminar",
    "Humanities",
    "Intercultural and Global Inquiry",
    "Logic/Mathematical Reasoning",
    "Perspectives on Justice and Injustice",
    "Scientific Inquiry",
    "Social Sciences",
    "The Arts",
];
const SCStags = ["Science", "Lab", "FYW", "Cat 1", "Cat 2", "Cat 3", "Unconstrained"];
const MCStags = [
    "Life Sciences",
    "Physical Sciences",
    "Math/Stats/CS",
    "First Year",
    "Science and Society",
    "Engage",
    "Cultural/Global Understanding",
];

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("gened")
        .setDescription("List all possible geneds")
        .addStringOption((option) =>
            option
                .setName("school")
                .setDescription("What school, only CIT, Dietrich, MCS, and SCS")
                .setRequired(true)
                .setAutocomplete(true),
        )
        .addStringOption((option) =>
            option
                .setName("category")
                .setDescription("What category the gened falls in (varies by school)")
                .setRequired(false)
                .setAutocomplete(true),
        ),
    async execute(interaction) {
        const coursesData = COURSES_DATA;
        const school = interaction.options.getString("school", true);
        const category = interaction.options.getString("category", false);

        if (!schools.includes(school)) {
            return interaction.reply({
                content: "Please input a valid school",
                flags: MessageFlags.Ephemeral,
            });
        }
        let genedData: Gened[] = [];
        let tags: string[] = [];
        switch (school) {
            case "CIT":
                genedData = CITData as Gened[];
                tags = CITtags;
                break;
            case "MCS":
                genedData = MCSData as Gened[];
                tags = MCStags;
                break;
            case "SCS":
                genedData = SCSData as Gened[];
                tags = SCStags;
                break;
            case "DC":
                genedData = DCData as Gened[];
                tags = DCtags;
                break;
        }
        if (genedData.length === 0) {
            return interaction.reply({
                content: `No geneds found for ${school}${category ? ` in "${category}"` : ""}.`,
                flags: MessageFlags.Ephemeral,
            });
        }
        function buildGenedPages(entries: Gened[], label: string): EmbedBuilder[] {
            const baseEmbed = new EmbedBuilder()
                .setTitle(bold(underline(`${school} Geneds: ${label}`)))
                .setURL(`${SCOTTYLABS_URL}/geneds`)
                .setDescription(`List of geneds`);
            const pages: EmbedBuilder[] = [];
            let chunk: string[] = [];
            let index = 0;

            for (const gened of entries) {
                const courseCode = gened.courseID;
                const course = coursesData[courseCode];
                const entry = course
                    ? hyperlink(
                          `${bold(courseCode)}: ${course.name}`,
                          `${SCOTTYLABS_URL}/course/${courseCode}`,
                      )
                    : `${bold(courseCode)}: Course details unavailable`;
                chunk.push(entry);
                index++;

                if (chunk.length >= 15 || index === entries.length) {
                    chunk.push(italic("Gened data may be out of date"));
                    const embed = EmbedBuilder.from(baseEmbed).setDescription(chunk.join("\n"));
                    pages.push(embed);
                    chunk = [];
                }
            }
            if (pages.length === 0) {
                pages.push(EmbedBuilder.from(baseEmbed).setDescription("No geneds found."));
            }
            return pages;
        }
        const summaryByCourseCode = FCE_STARTUP_CACHE.summaryByCourseCode;
        function buildFCEGenedPages(entries: Gened[], label: string): EmbedBuilder[] {
            const baseEmbed = new EmbedBuilder()
                .setTitle(bold(underline(`${school} Geneds: ${label}`)))
                .setURL(`${SCOTTYLABS_URL}/geneds`)
                .setDescription(`List of geneds`);
            const pages: EmbedBuilder[] = [];
            let chunk: string[] = [];
            let index = 0;
            chunk.push("Course rating - FCE \u2014 Course");
            for (const gened of entries) {
                const courseCode = gened.courseID;
                const course = coursesData[courseCode];
                const fce = summaryByCourseCode.get(courseCode);
                let entry = `${
                    fce
                        ? `${fce.courseRate.toFixed(2)}/5 - ${fce.workload.toFixed(
                              2,
                          )} hrs/wk \u2014 `
                        : `N/A`
                }`;
                entry += course
                    ? hyperlink(
                          `${bold(courseCode)}: ${course.name}`,
                          `${SCOTTYLABS_URL}/course/${courseCode}`,
                      )
                    : `${bold(courseCode)}: Course details unavailable`;
                chunk.push(entry);
                index++;

                if (chunk.length >= 10 || index === entries.length) {
                    chunk.push(italic("Gened data may be out of date"));
                    const embed = EmbedBuilder.from(baseEmbed).setDescription(chunk.join("\n"));
                    pages.push(embed);
                    chunk = [];
                }
            }
            if (pages.length === 0) {
                pages.push(EmbedBuilder.from(baseEmbed).setDescription("No geneds found."));
            }
            return pages;
        }

        const selectOptions: {
            label: string;
            value: string;
            default: boolean;
            pages: EmbedBuilder[];
        }[] = [];

        if (category) {
            //TODO: Use a select row to switch between all, sort FCE, sort course
            //TODO: modify select options
            if (!tags.includes(category)) {
                return interaction.reply({
                    content: "Please input a category",
                    flags: MessageFlags.Ephemeral,
                });
            }
            genedData = genedData.filter((c) => c.tags.includes(category));
            selectOptions.push({
                label: category,
                value: category,
                default: true,
                pages: buildGenedPages(genedData, category),
            });
            selectOptions.push({
                label: "FCE Ascending",
                value: "fce",
                default: false,
                pages: buildFCEGenedPages(
                    genedData.sort((a, b) => {
                        const aWorkload = summaryByCourseCode.get(a.courseID)?.workload;
                        const bWorkload = summaryByCourseCode.get(b.courseID)?.workload;
                        if (aWorkload === undefined) {
                            return bWorkload === undefined ? 0 : 1;
                        }
                        if (bWorkload === undefined) return -1;
                        return aWorkload - bWorkload;
                    }),
                    category,
                ),
            });
            selectOptions.push({
                label: "Course Rating Descending",
                value: "course",
                default: false,
                pages: buildFCEGenedPages(
                    genedData.sort((a, b) => {
                        const aWorkload = summaryByCourseCode.get(a.courseID)?.courseRate;
                        const bWorkload = summaryByCourseCode.get(b.courseID)?.courseRate;
                        if (aWorkload === undefined) {
                            return bWorkload === undefined ? 0 : 1;
                        }
                        if (bWorkload === undefined) return -1;
                        return bWorkload - aWorkload;
                    }),
                    category,
                ),
            });
        } // no category given
        else {
            selectOptions.push({
                label: "All",
                value: "all",
                default: true,
                pages: buildGenedPages(genedData, "All"),
            });
            for (const tag of tags) {
                selectOptions.push({
                    label: `${tag}`,
                    value: tag,
                    default: false,
                    pages: buildGenedPages(
                        genedData.filter((c) => c.tags.includes(tag)),
                        tag,
                    ),
                });
            }
        }
        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("gened_select_menu")
                .addOptions(selectOptions),
        );

        const paginator = new EmbedPaginator({
            pages: selectOptions[0]!.pages,
            components: [selectRow],
            async onCollect(collectInteraction) {
                if (!collectInteraction.isStringSelectMenu()) return;
                const choice = collectInteraction.values[0]!;
                const selected = selectOptions.find((option) => option.value === choice);
                paginator.setPages(selected!.pages);
                selectRow.components[0]?.setOptions(
                    selectOptions.map((option) => ({
                        ...option,
                        default: option.value === choice,
                    })),
                );
            },
        });
        await paginator.send(interaction);
        return;
    },
    async autocomplete(_client, interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const focusedValue = focusedOption.value.toLowerCase();
        let choices: { name: string; value: string }[] = [];
        if (focusedOption.name === "school") {
            const options = schools;
            const filteredOptions =
                focusedValue === ""
                    ? options
                    : search(focusedValue, options, {
                          keySelector: (name) => name,
                      });
            choices = filteredOptions.slice(0, 15).map((name) => ({
                name,
                value: name,
            }));
        } else if (focusedOption.name === "category") {
            const selectedSchool = interaction.options.getString("school");
            let options: string[] = [];
            switch (selectedSchool) {
                case "CIT":
                    options = CITtags;
                    break;
                case "MCS":
                    options = MCStags;
                    break;
                case "SCS":
                    options = SCStags;
                    break;
                case "DC":
                    options = DCtags;
                    break;
            }
            const filteredOptions =
                focusedValue === ""
                    ? options
                    : search(focusedValue, options, {
                          keySelector: (name) => name,
                      });
            choices = filteredOptions.slice(0, 15).map((name) => ({
                name,
                value: name,
            }));
        }
        await interaction.respond(choices);
    },
};

export default command;
