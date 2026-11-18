import {
    ActionRowBuilder,
    bold,
    EmbedBuilder,
    hyperlink,
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

enum Sort {
    None = "Sort: None",
    FceAsc = "Sort: FCE Ascending",
    FceDesc = "Sort: FCE Descending",
    CourseAsc = "Sort: Course Rating Ascending",
    CourseDesc = "Sort: Course Rating Descending",
}
type Gened = {
    courseID: string;
    school: string;
    tags: string[];
    lastUpdated: string;
};
const schools = ["CIT", "DC", "SCS", "MCS"];
const CITtags = [
    "All",
    "Free Elective Only",
    "General Education Elective",
    "Innovation & Internationalization",
    "People, Places, & Cultures",
    "Social Analysis & Decision Making",
    "Writing & Expression",
];
const DCtags = [
    "All",
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
const SCStags = ["All", "Science", "Lab", "FYW", "Cat 1", "Cat 2", "Cat 3", "Unconstrained"];
const MCStags = [
    "All",
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
        .setDescription("List all possible geneds by school with sorting")
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
        let category = interaction.options.getString("category", false);
        category = category ?? "All";
        if (!schools.includes(school)) {
            return interaction.reply({
                content: "Please input a valid school",
                flags: MessageFlags.Ephemeral,
            });
        }
        let genedData: Gened[] = [];
        let tags: string[] = [];

        // select the correct data
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
        /** returns genedData filtered to one of the categories, if category is All, removes duplicates*/
        function filterGeneds(category: string): Gened[] {
            const entries =
                category === "All" ? genedData : genedData.filter((c) => c.tags.includes(category));

            return entries.filter(
                (item, index) =>
                    entries.findIndex((entry) => entry.courseID === item.courseID) === index,
            );
        }
        /** returns a page listing geneds with no additional info */
        function buildGenedPages(entries: Gened[], label: string): EmbedBuilder[] {
            const description = `List of geneds, use dropdowns to select category and sort, total: ${bold(
                String(entries.length),
            )}`;
            const baseEmbed = new EmbedBuilder()
                .setTitle(bold(underline(`${school} Geneds: ${label}`)))
                .setURL(`${SCOTTYLABS_URL}/geneds`)
                .setDescription(description)
                .setFooter({
                    text: `Gened data may not be up to date. Please check the ${school} website for the most accurate info.`,
                });
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

                if (chunk.length >= 20 || index === entries.length) {
                    const embed = EmbedBuilder.from(baseEmbed).setDescription(
                        `${description}\n${chunk.join("\n")}`,
                    );
                    pages.push(embed);
                    chunk = [];
                }
            }
            if (pages.length === 0) {
                pages.push(
                    EmbedBuilder.from(baseEmbed).setDescription(
                        `${description}\n\nNo geneds found.`,
                    ),
                );
            }
            return pages;
        }
        const summaryByCourseCode = FCE_STARTUP_CACHE.summaryByCourseCode;
        /** comparison function to use with .sort */
        function sortFCE(a: Gened, b: Gened, descending = false) {
            const aWorkload = summaryByCourseCode.get(a.courseID)?.workload;
            const bWorkload = summaryByCourseCode.get(b.courseID)?.workload;
            if (aWorkload === undefined) {
                return bWorkload === undefined ? 0 : 1;
            }
            if (bWorkload === undefined) return -1;
            return descending ? bWorkload - aWorkload : aWorkload - bWorkload;
        }
        /** comparison function to use with .sort */
        function sortCourseRating(a: Gened, b: Gened, descending = false) {
            const aRating = summaryByCourseCode.get(a.courseID)?.courseRate;
            const bRating = summaryByCourseCode.get(b.courseID)?.courseRate;
            if (aRating === undefined) {
                return bRating === undefined ? 0 : 1;
            }
            if (bRating === undefined) return -1;
            return descending ? bRating - aRating : aRating - bRating;
        }
        /** returns a page listing geneds with course ratings and fce listed */
        function buildFCEGenedPages(entries: Gened[], label: string): EmbedBuilder[] {
            const description = `List of sorted geneds, use dropdowns to select category and sort, total: ${bold(
                String(entries.length),
            )}`;
            const baseEmbed = new EmbedBuilder()
                .setTitle(bold(underline(`${school} Geneds: ${label}`)))
                .setURL(`${SCOTTYLABS_URL}/geneds`)
                .setDescription(description)
                .setFooter({
                    text: `Gened data may not be up to date. Please check the ${school} website for the most accurate info.`,
                });
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
                        ? `${bold(fce.courseRate.toFixed(2))}/5 - ${bold(
                              fce.workload.toFixed(2),
                          )} hrs/wk \u2014 `
                        : `N/A     \u2014     `
                }`;
                entry += course
                    ? hyperlink(
                          `${bold(courseCode)}: ${course.name}`,
                          `${SCOTTYLABS_URL}/course/${courseCode}`,
                      )
                    : `${bold(courseCode)}: Course details unavailable`;
                chunk.push(entry);
                index++;

                if (chunk.length >= 20 || index === entries.length) {
                    const embed = EmbedBuilder.from(baseEmbed).setDescription(
                        `${description}\n${chunk.join("\n")}`,
                    );
                    pages.push(embed);
                    chunk = [];
                }
            }
            if (pages.length === 0) {
                pages.push(
                    EmbedBuilder.from(baseEmbed).setDescription(
                        `${description}\n\nNo geneds found.`,
                    ),
                );
            }
            return pages;
        }
        /** returns the appropriate page by either calling buildGenedPages or buildFCEGenedPages */
        function buildSortedPage(entries: Gened[], label: string, sortType: Sort): EmbedBuilder[] {
            switch (sortType) {
                case Sort.None:
                    return buildGenedPages(entries, label);

                case Sort.FceAsc:
                    return buildFCEGenedPages(
                        entries.sort((a, b) => sortFCE(a, b)),
                        label,
                    );

                case Sort.FceDesc:
                    return buildFCEGenedPages(
                        entries.sort((a, b) => sortFCE(a, b, true)),
                        label,
                    );

                case Sort.CourseAsc:
                    return buildFCEGenedPages(
                        entries.sort((a, b) => sortCourseRating(a, b)),
                        label,
                    );

                case Sort.CourseDesc:
                    return buildFCEGenedPages(
                        entries.sort((a, b) => sortCourseRating(a, b, true)),
                        label,
                    );
            }
        }

        const selectOptions: {
            label: string;
            value: string;
            default: boolean;
            pages: EmbedBuilder[];
        }[] = [];

        for (const tag of tags) {
            selectOptions.push({
                label: `${tag}`,
                value: tag,
                default: tag === category,
                pages: buildGenedPages(tag != "All" ? filterGeneds(tag) : filterGeneds("All"), tag),
            });
        }

        const sortOptions: {
            label: string;
            value: Sort;
            default: boolean;
            pages: EmbedBuilder[];
        }[] = [];
        for (const sort of Object.values(Sort)) {
            sortOptions.push({
                label: sort,
                value: sort,
                default: sort === Sort.None,
                pages: buildGenedPages(genedData, category),
            });
        }
        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("gened_select_menu")
                .addOptions(selectOptions),
        );
        const selectRowSort = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId("gened_sort_menu").addOptions(sortOptions),
        );

        let sortType: Sort = Sort.None;
        const paginator = new EmbedPaginator({
            // find where category is so we have it selected as the default option
            pages:
                selectOptions.find((option) => option.value === category)?.pages ??
                selectOptions[0]!.pages,
            components: [selectRow, selectRowSort],
            async onCollect(collectInteraction) {
                if (!collectInteraction.isStringSelectMenu()) return;
                const choice = collectInteraction.values[0]!;

                // check if the category was changed
                let selected = selectOptions.find((option) => option.value === choice);

                // if selected is not null, the category is the one that changed
                if (selected) {
                    // change category
                    category = selected.value!;
                    selectRow.components[0]?.setOptions(
                        selectOptions.map((option) => ({
                            ...option,
                            default: option.value === choice,
                        })),
                    );
                } else {
                    //change sort
                    selected = sortOptions.find((option) => option.value === choice)!;

                    //convert string to Sort enum
                    sortType = Object.values(Sort).find((s) => s === selected!.value)!;

                    selectRowSort.components[0]?.setOptions(
                        sortOptions.map((option) => ({
                            ...option,
                            default: option.value === choice,
                        })),
                    );
                }

                //build new page
                selected!.pages = buildSortedPage(filterGeneds(category!), category!, sortType);

                //update page
                paginator.setPages(selected!.pages);
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
