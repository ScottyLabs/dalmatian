import {
    EmbedBuilder,
    hyperlink,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { SCOTTYLABS_URL } from "../constants.js";
import SyllabiData from "../data/course-api.syllabi.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { FCE_DATA_BY_COURSE } from "../utils/fceCache.ts";
import { formatCourseNumber, loadCoursesData } from "../utils/index.ts";

type Syllabus = {
    _id: {
        $oid: string;
    };
    season: string;
    year: number;
    number: string;
    section: string;
    url: string;
};

function loadSyllabiData(): Record<string, Syllabus[]> {
    const syllabiData = SyllabiData as Syllabus[];
    const syllabi: Record<string, Syllabus[]> = {};

    const seasonOrder: Record<string, number> = {
        F: 0,
        S: 1,
        M: 2,
        N: 3, // retained for compatability with summers before 2026
    };

    for (const entry of syllabiData) {
        const courseid = formatCourseNumber(entry.number) ?? "";
        if (!syllabi[courseid]) {
            syllabi[courseid] = [];
        }
        syllabi[courseid].push(entry);
    }

    for (const courseid in syllabi) {
        syllabi[courseid]!.sort((a, b) => {
            if (a.year !== b.year) {
                return b.year - a.year;
            }

            return (
                (seasonOrder[a.season] ?? 99) - (seasonOrder[b.season] ?? 99)
            );
        });
    }

    return syllabi;
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("syllabus")
        .setDescription("Get pdfs of syllabi for a course")
        .addStringOption((option) =>
            option
                .setName("course_id")
                .setDescription(
                    "Course code in XX-XXX or XXXXX format (e.g., 15-112)",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        const coursesData = loadCoursesData();
        const syllabi = loadSyllabiData();
        const fceData = FCE_DATA_BY_COURSE;

        const courseid = formatCourseNumber(
            interaction.options.getString("course_id", true),
        );

        if (!courseid) {
            return interaction.reply({
                content:
                    "Please provide a valid course code in the format XX-XXX or XXXXX.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const course = coursesData[courseid];

        if (!syllabi[courseid] || !course) {
            return interaction.reply({
                content: `Course ${courseid} not found.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const foundSyllabi = syllabi[courseid];
        const uniqueSyllabi = [
            ...new Map(foundSyllabi.map((s) => [s.url, s])).values(),
        ];

        const embeds: EmbedBuilder[] = [];
        let currentDesc = "";
        let links = 0;

        for (const syllabus of uniqueSyllabi) {
            /*
            Currently this uses fce data to find instructor data
            However, syllabi data should be updated to include instructor,
            and courses data should be changed to correctly include
            syllabi and session as intended
            */

            const fceRecords = fceData[courseid]?.records ?? [];
            let fceEntry = undefined;

            for (const rec of fceRecords) {
                if (
                    rec.section === syllabus.section &&
                    (rec.semesterLabel ===
                        `${syllabus.season}${syllabus.year}` ||
                        (syllabus.season === "N" &&
                            rec.semesterLabel === `M${syllabus.year}`))
                    // edge-case: syllabi summers before 2026 can start with M or N, but FCE data always start with M
                ) {
                    fceEntry = rec;
                }
            }

            const line: string = hyperlink(
                `${syllabus.season}${syllabus.year}: ${syllabus.number}-${syllabus.section} ${fceEntry?.instructor ? `(${fceEntry.instructor})` : ""} \n`,
                `${syllabus.url}`,
            );

            if (links >= 20) {
                embeds.push(
                    new EmbedBuilder()
                        .setTitle(`Syllabi for ${courseid}: ${course.name}`)
                        .setURL(`${SCOTTYLABS_URL}/course/${courseid}`)
                        .setDescription(currentDesc),
                );
                currentDesc = line;
                links = 1;
            } else {
                currentDesc += line;
                links++;
            }
        }

        if (currentDesc) {
            embeds.push(
                new EmbedBuilder()
                    .setTitle(`Syllabi for ${courseid}: ${course.name}`)
                    .setURL(`${SCOTTYLABS_URL}/course/${courseid}`)
                    .setDescription(currentDesc),
            );
        }

        return new EmbedPaginator({ pages: embeds }).send(interaction);
    },
};

export default command;
