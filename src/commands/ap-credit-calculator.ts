import { Message, MessageFlags, SlashCommandBuilder } from "discord.js";
import { boolean } from "drizzle-orm/gel-core";
import apCreditData from "../data/ap-credit.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";

type Exam = {
    name: String;
    score: number;
};

type Entry = {
    exams: Exam[];
    courses: string[];
};

type ExamRecord = Record<string, Record<number, string[]>>;

async function loadApCreditData(): Promise<ExamRecord> {
    const record: ExamRecord = {};

    for (const entry of apCreditData) {
        for (const exam of entry.exams) {
            if (!record[exam.name]) {
                record[exam.name] = {};
            }

            record[exam.name]![exam.score] = entry.courses;
        }
    }

    return record;
}

("");
async function isValidInput(aps: String): Promise<Record<String, Integer>> {
    pass;
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("Credit Calculator")
        .setDescription("Credit Calculator for CMU courses")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("AP")
                .setDescription(
                    "Calculate units, gen eds, and courses waived through your APs",
                )
                .addStringOption((option) =>
                    option
                        .setName("College")
                        .setDescription("Your college")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("APs")
                        .setDescription(
                            "APs taken with score (Exam:Score ex. Biology:5,CSA:5,APUSH:4)",
                        )
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        let college = interaction.options.getString("College");
        let aps = interaction.options.getString("APs");
        let APrecord = loadApCreditData();
        const collegeNames: Set<String> = new Set([
            "DC",
            "CIT",
            "SCS",
            "MCS",
            "TEP",
        ]);

        if (!college || !(college in collegeNames)) {
            return interaction.reply({
                content:
                    "Not a valid College (accepted: DC, CIT, SCS, MCS, TEP)",
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!aps || isValidInput(aps)) {
            return interaction.reply({
                content: "Not a valid AP input (accepted: Exam:Score,...)",
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (interaction.options.getSubcommand() === "AP") {
        }

        return interaction.editReply(``);
    },
};

export default command;
