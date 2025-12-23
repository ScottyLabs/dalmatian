import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import apAliases from "../data/ap-aliases.json" with { type: "json" };
import apCreditData from "../data/ap-credit.json" with { type: "json" };

import type { SlashCommand } from "../types.d.ts";

type Exam = {
    name: string;
    aliases: string[];
    scores: {
        score: number;
        courses: string[];
    }[];
};

type AliasEntry = {
    name: string;
    aliases: string[];
};

function buildAliasMap(apAliases: AliasEntry[][]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const group of apAliases) {
        for (const entry of group) {
            map.set(entry.name, entry.aliases);
        }
    }

    return map;
}

async function loadApCreditData(): Promise<Exam[]> {
    const exams: Exam[] = [];
    const aliasMap = buildAliasMap(apAliases);

    for (const entry of apCreditData) {
        for (const exam of entry.exams) {
            let examObj = exams.find((e) => e.name === exam.name);

            if (!examObj) {
                examObj = {
                    name: exam.name,
                    aliases: aliasMap.get(exam.name) ?? [],
                    scores: [],
                };
                exams.push(examObj);
            }

            let scoreObj = examObj.scores.find((s) => s.score === exam.score);

            if (!scoreObj) {
                scoreObj = {
                    score: exam.score,
                    courses: [],
                };
                examObj.scores.push(scoreObj);
            }

            scoreObj.courses.push(...entry.courses);
        }
    }

    return exams;
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("credit-calculator")
        .setDescription("Credit Calculator for CMU courses")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ap")
                .setDescription(
                    "Calculate units and courses waived through your APs",
                ),
        ),

    async execute(interaction) {
        let APrecord = await loadApCreditData();

        if (interaction.options.getSubcommand() === "ap") {
            const embed0 = new EmbedBuilder()
                .setTitle("AP Credit Calculator")
                .setDescription("Use dropdowns to ");

            const selectRow =
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("ap_select")
                        .setPlaceholder("Select AP exams")
                        .setMinValues(1)
                        .addOptions(
                            { label: "Calculus AB", value: "Calculus AB" },
                            { label: "Biology", value: "Biology" },
                        ),
                );

            const buttonRow =
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId("prevPage")
                        .setLabel("Previous")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("nextPage")
                        .setLabel("Next")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("submit")
                        .setLabel("Submit")
                        .setStyle(ButtonStyle.Success),
                );

            interaction.reply({
                embeds: [embed0],
                components: [selectRow, buttonRow],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

export default command;
