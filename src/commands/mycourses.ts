import {
    bold,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    hyperlink,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../types.d.ts";
import { db, myCourses } from "../db/index.ts";
import { and, count, eq, inArray } from "drizzle-orm";
import { COURSES_DATA, formatCourseNumber, splitCourseList } from "../utils/index.ts";
import { calculateTotalUnits } from "../utils/fceCache.ts";
import { SCOTTYLABS_URL } from "../constants.ts";
import { handleFCECommand } from "./fce.ts";

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("mycourses")
        .setDescription("Manage your personal course list")
        .addSubcommand((subcommand) =>
            subcommand.setName("list").setDescription("List your personal courses"),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("fce").setDescription("View FCE data for your personal courses"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add course(s) to your personal course slist")
                .addStringOption((option) =>
                    option
                        .setName("course_codes")
                        .setDescription(
                            "The course code(s) to add, separated by space (e.g., 15-112 21-127)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove course(s) from your personal course list")
                .addStringOption((option) =>
                    option
                        .setName("course_codes")
                        .setDescription(
                            "The course code(s) to remove, separated by space (e.g., 15-112 21-127)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("clear").setDescription("Reset your personal course list"),
        ),

    execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        await subcommandHandlers[subcommand](interaction);
    },
};

function abbreviateStuco(name: string): string {
    return name.replace(/^Student Taught Courses \(StuCo\):\s+/, "StuCo: ");
}

type InteractionHandler = (interaction: ChatInputCommandInteraction) => Promise<any>;
const subcommandHandlers: Record<string, InteractionHandler> = {
    list: async (interaction) => {
        const records = await db
            .select()
            .from(myCourses)
            .where(eq(myCourses.userId, interaction.user.id));
        const courseCodes = records.map((r) => r.courseCode);

        if (!courseCodes.length) {
            // TODO: was gonna dynamically fetch command mention;
            // does d.js fetch application commands on startup?
            const addCoursesRef = "`/mycourses add`";
            return interaction.reply({
                content: `You have no personal courses! Add some using ${addCoursesRef}`,
                flags: MessageFlags.Ephemeral,
            });
        }
        const missing = courseCodes.filter((code) => !(code in COURSES_DATA));
        const courses = courseCodes.map((code) => COURSES_DATA[code]!); // filtered out invalid codes above

        const lines = courses.map(({ id: code, name, units }) => {
            const link = hyperlink(
                `${bold(code)}: ${abbreviateStuco(name)}`,
                `${SCOTTYLABS_URL}/course/${code}`,
            );
            return `${link} (${calculateTotalUnits([units])} units)`;
        });
        if (missing.length) {
            lines.push(
                `:warn: The following course codes are no longer available: ${missing.join(", ")}`,
            );
        }
        const totalUnits = calculateTotalUnits(courses.map((c) => c.units));

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `Courses for ${interaction.user.username}`,
                iconURL: interaction.user.avatarURL() ?? undefined,
            })
            .setDescription(lines.join("\n"))
            .setFooter({ text: `Total units: ${totalUnits}` });

        await interaction.reply({ embeds: [embed] });
    },
    fce: async (interaction) => {
        const records = await db
            .select()
            .from(myCourses)
            .where(eq(myCourses.userId, interaction.user.id));
        const courseCodes = records.map((r) => r.courseCode);

        if (!courseCodes.length) {
            return interaction.reply({
                content: "You have no personal courses! Add some using `/mycourses add`",
                flags: MessageFlags.Ephemeral,
            });
        }

        await handleFCECommand(interaction, courseCodes, { alwaysList: true });
    },
    add: async (interaction) => {
        const rawCodes = splitCourseList(interaction.options.getString("course_codes", true));
        if (rawCodes.length === 0) {
            return interaction.reply({
                content: "Please provide at least one course code.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const resolvedCodes = Array.from(new Set(rawCodes)).map(formatCourseNumber);
        const validCodes = resolvedCodes.filter(
            (code): code is string => code != null && code in COURSES_DATA,
        );
        if (!validCodes.length) {
            return interaction.reply({
                content: "No valid course codes provided. Example of a valid course code: 15-112",
                flags: MessageFlags.Ephemeral,
            });
        }

        const currentCount = await db
            .select({ currentCount: count() })
            .from(myCourses)
            .where(eq(myCourses.userId, interaction.user.id))
            .execute()
            .then((res) => res[0]?.currentCount ?? 0);

        // TODO: should max courses be 10? should max courses be moved into a constant?
        if (currentCount + validCodes.length > 10) {
            return interaction.reply({
                content: `You can only have a maximum of 10 courses in your personal course list. (You already have ${currentCount}.)`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const entries = validCodes.map((code) => ({
            userId: interaction.user.id,
            courseCode: code,
        }));
        await db.insert(myCourses).values(entries).onConflictDoNothing().execute();

        const lines = validCodes.map((code) => {
            const { name, units } = COURSES_DATA[code]!;
            const link = hyperlink(
                `${bold(code)}: ${abbreviateStuco(name)}`,
                `<${SCOTTYLABS_URL}/course/${code}>`,
            );
            return `${link} (${calculateTotalUnits([units])} units)`;
        });
        if (lines.length < resolvedCodes.length) {
            const invalidCodes = resolvedCodes.filter((code) => !validCodes.includes(code ?? ""));
            lines.push(
                `:warn: The following course codes are invalid or not found: ${invalidCodes.join(", ")}`,
            );
        }
        const plural = validCodes.length === 1 ? "course" : "courses";
        const content = `Added ${validCodes.length} ${plural} to your personal course list:\n${lines.join("\n")}`;
        await interaction.reply({ content });
    },
    remove: async (interaction) => {
        const rawCodes = splitCourseList(interaction.options.getString("course_codes", true));
        if (rawCodes.length === 0) {
            return interaction.reply({
                content: "Please provide at least one course code.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const resolvedCodes = Array.from(new Set(rawCodes)).map(formatCourseNumber);
        const validCodes = resolvedCodes.filter((code): code is string => code != null);
        if (!validCodes.length) {
            return interaction.reply({
                content: "No valid course codes provided. Example of a valid course code: 15-112",
                flags: MessageFlags.Ephemeral,
            });
        }
        const deleteResult = await db
            .delete(myCourses)
            .where(
                and(
                    eq(myCourses.userId, interaction.user.id),
                    inArray(myCourses.courseCode, validCodes),
                ),
            )
            .execute();
        if (!deleteResult.count) {
            return interaction.reply({
                content: "No matching courses found in your personal course list.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const plural = deleteResult.count === 1 ? "course" : "courses";
        await interaction.reply({
            content: `Removed ${deleteResult.count} ${plural} (${validCodes.join(", ")}) from your personal course list.`,
        });
    },
    clear: async (interaction) => {
        const deleteResult = await db
            .delete(myCourses)
            .where(eq(myCourses.userId, interaction.user.id))
            .execute();
        if (!deleteResult.count) {
            return interaction.reply({
                content: "Your personal course list is already empty.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // TODO: confirmation prompt?
        const plural = deleteResult.count === 1 ? "course" : "courses";
        await interaction.reply({
            content: `Cleared your personal course list! (Removed ${deleteResult.count} ${plural}.)`,
        });
    },
};

export default command;
