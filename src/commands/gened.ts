import {
    bold,
    EmbedBuilder,
    hyperlink,
    italic,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import { SCOTTYLABS_URL } from "../constants.ts";
import type { SlashCommand } from "../types.d.ts";
import { COURSES_DATA } from "../utils/index.ts";
import { search } from "fast-fuzzy";
import CITData from "../data/geneds/cit.json" with { type: "json" };
import DCData from "../data/geneds/dietrich.json" with { type: "json" };
import MCSData from "../data/geneds/mcs.json" with { type: "json" };
import SCSData from "../data/geneds/scs.json" with { type: "json" };
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";

type Gened = {
    courseID: string;
    school: string;
    tags: string[];
    lastUpdated: string;
};
const schools = ["CIT", "DC", "SCS", "MCS"];
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

        switch (school) {
            case "CIT":
                genedData = CITData as Gened[];
                break;
            case "MCS":
                genedData = MCSData as Gened[];
                break;
            case "SCS":
                genedData = SCSData as Gened[];
                break;
            case "DC":
                genedData = DCData as Gened[];
                break;
        }
        if (category) {
            genedData = genedData.filter((c) => c.tags.includes(category));
        }
        const baseEmbed = new EmbedBuilder()
            .setTitle(bold(underline(`${school} geneds: ${category ? category : "any"}`)))
            .setURL(`${SCOTTYLABS_URL}/geneds`)
            .setDescription(`List of geneds`);

        const pages: EmbedBuilder[] = [];
        let chunk: string[] = [];
        let index = 0;

        for (const gened of genedData) {
            const courseCode = gened.courseID;
            const course = coursesData[courseCode];
            const entry = hyperlink(
                `${bold(courseCode)}: ${course?.name}`,
                `${SCOTTYLABS_URL}/course/${courseCode}`,
            );
            chunk.push(entry);
            index++;

            if (chunk.length >= 15 || index === genedData.length) {
                chunk.push(italic("Gened data may be out of date"));
                const embed = EmbedBuilder.from(baseEmbed).setDescription(chunk.join("\n"));
                pages.push(embed);
                chunk = [];
            }
        }
        const paginator = new EmbedPaginator({ pages });
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
                    options = [
                        "Free Elective Only",
                        "General Education Elective",
                        "Innovation & Internationalization",
                        "People, Places, & Cultures",
                        "Social Analysis & Decision Making",
                        "Writing & Expression",
                    ];
                    break;
                case "MCS":
                    options = [
                        "Life Sciences",
                        "Physical Sciences",
                        "Math/Stats/CS",
                        "First Year",
                        "Science and Society",
                        "Engage",
                        "Cultural/Global Understanding",
                    ];
                    break;
                case "SCS":
                    options = ["Science", "Lab", "FYW", "Cat 1", "Cat 2", "Cat 3", "Unconstrained"];
                    break;
                case "DC":
                    options = [
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
