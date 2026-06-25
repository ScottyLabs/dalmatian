import { hyperlink, MessageFlags, SlashCommandBuilder } from "discord.js";
import { SCHOOLS, SCOTTYLABS_URL } from "../constants.ts";
import CoursesData from "../data/courseCatalog.json" with { type: "json" };
import CITGenedData from "../data/geneds/cit.json" with { type: "json" };
import DCGenedData from "../data/geneds/dietrich.json" with { type: "json" };
import MCSGenedData from "../data/geneds/mcs.json" with { type: "json" };
import SCSGenedData from "../data/geneds/scs.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import {
    AdvancedCreditType,
    Exam,
    getGenedsForCourse,
    loadCreditData,
    School,
    SCORE_RANGES,
} from "../utils/advancedCreditCourseUtils.ts";
import {
    type SelectedExam,
    type SetupField,
    SetupForm,
    type SetupResult,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";
import { Course, GenEd } from "../utils/index.ts";

function isSelectedExam(value: unknown): value is SelectedExam {
    return (
        typeof value === "object" &&
        value !== null &&
        "examName" in value &&
        typeof value.examName === "string" &&
        "score" in value &&
        (typeof value.score === "number" || typeof value.score === "string")
    );
}

function selectedExamsForKey(data: Record<string, unknown>, key: string): SelectedExam[] {
    const value = data[key];
    return Array.isArray(value) ? value.filter(isSelectedExam) : [];
}

function getGenedsForSchool(userSchool: School): GenEd[] {
    if (userSchool === "DC") return DCGenedData as GenEd[];
    if (userSchool === "CIT") return CITGenedData as GenEd[];
    if (userSchool === "MCS") return MCSGenedData as GenEd[];
    if (userSchool === "SCS") return SCSGenedData as GenEd[];
    return [];
}

export function buildAdvancedCreditResult(
    data: Record<string, unknown>,
    exams: Exam[],
    coursesType: AdvancedCreditType,
    userSchool: School,
): SetupResult {
    const courses = CoursesData as Record<string, Course>;
    const awarded: { exam: Exam; courses: Course[] }[] = [];

    const processCategory = (entries: SelectedExam[]) => {
        entries.forEach(({ examName, score }) => {
            if (score === undefined) return;

            const sameName = exams.filter((e) => e.name === examName);

            const chosenExams = (() => {
                const specific: typeof sameName = [];
                const general: typeof sameName = [];

                for (const e of sameName) {
                    if (e.school?.includes(userSchool)) specific.push(e);
                    else if (!e.school || e.school.length === 0) general.push(e);
                }

                return specific.length > 0 ? specific : general;
            })();

            const results = chosenExams.flatMap((exam) => {
                const awardedCourses = exam.scores
                    .filter((s) => s.score === score)
                    .flatMap((s) => s.courses);

                return awardedCourses.length ? [{ exam, courses: awardedCourses }] : [];
            });

            awarded.push(...results);
        });
    };

    processCategory(selectedExamsForKey(data, "stem-arts"));
    processCategory(selectedExamsForKey(data, "humanities"));

    if (awarded.length === 0) {
        return {
            title: "Awarded CMU Credit",
            description: "*Gened data is incomplete and partly outdated*",
            emptyMessage: "No credit awarded based on the selected exams.",
            items: [],
        };
    }

    const notices: string[] = [];
    if (userSchool === "CFA" || userSchool === "TEP") {
        notices.push(`Gened data not available for ${userSchool}`);
    }

    let genedCreditTotal = 0;
    const geneds = getGenedsForSchool(userSchool);
    const allAwardedCourseIds = new Set<string>();
    const items: string[] = [];

    for (const { exam, courses: awardedCourses } of awarded) {
        for (const course of awardedCourses) {
            if (allAwardedCourseIds.has(course.id)) continue;

            allAwardedCourseIds.add(course.id);

            const units = exam.overrideUnits ?? (Number(course.units) || 0);
            genedCreditTotal += units;

            const courseName = courses[course.id]?.name ?? course.name;

            const genedList = geneds && course.id ? getGenedsForCourse(course.id, geneds) : [];

            const genedTags = genedList.length ? genedList.map((g) => `${g}`).join(" ") : "n/a";

            items.push(
                [
                    courseName.endsWith("(*Not Offered Course*)")
                        ? `**${course.id}** — ${coursesType} ${courseName} (${units} units) `
                        : hyperlink(
                              `**${course.id}** — ${courseName} (${units} units)`,
                              `${SCOTTYLABS_URL}/course/${course.id}`,
                          ),
                    genedTags != "n/a"
                        ? `${coursesType} ${exam.name} • Fulfills ${genedTags} Gened Requirement`
                        : `${coursesType} ${exam.name}`,
                    `${exam.info}`,
                ].join("\n"),
            );
        }
    }

    return {
        title: "Awarded CMU Credit",
        description: "*Gened data is incomplete and partly outdated*",
        emptyMessage: "No credit awarded based on the selected exams.",
        notices,
        items,
        footer: `**Unit Total:** ${genedCreditTotal}`,
    };
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("credits")
        .setDescription("Credit calculator for CMU courses")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ap")
                .setDescription("Calculate units and courses waived through your APs")
                .addStringOption((option) =>
                    option
                        .setName("school")
                        .setDescription("Enter College (DC, CIT, SCS, TEP, MCS, CFA)")
                        .setChoices(SCHOOLS.map((s) => ({ name: s, value: s })))
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ib")
                .setDescription("Calculate units and courses waived through your IBs")
                .addStringOption((option) =>
                    option
                        .setName("school")
                        .setDescription("Enter College (DC, CIT, SCS, TEP, MCS, CFA)")
                        .setChoices(SCHOOLS.map((s) => ({ name: s, value: s })))
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("cambridge")
                .setDescription(
                    "Calculate units and courses waived through your Cambridge A Levels",
                )
                .addStringOption((option) =>
                    option
                        .setName("school")
                        .setDescription("Enter College (DC, CIT, SCS, TEP, MCS, CFA)")
                        .setChoices(SCHOOLS.map((s) => ({ name: s, value: s })))
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const coursesType: AdvancedCreditType =
            subcommand === "ap" ? "AP" : subcommand === "ib" ? "IB" : "Cambridge";

        const userSchool = interaction.options.getString("school");

        if (!userSchool || !SCHOOLS.includes(userSchool)) {
            return interaction.reply({
                content: "Acceptable Colleges DC, CIT, SCS, TEP, MCS, CFA",
                flags: MessageFlags.Ephemeral,
            });
        }

        const exams = await loadCreditData(coursesType);

        const stemExams = exams.filter((e) => e.subject === "STEM");
        const artsExams = exams.filter((e) => e.subject === "Arts");
        const humanitiesExams = exams.filter((e) => e.subject === "Humanities");

        const stemExamsUnique = Array.from(new Map(stemExams.map((e) => [e.name, e])).values());

        const artsExamsUnique = Array.from(new Map(artsExams.map((e) => [e.name, e])).values());

        const humanitiesExamsUnique = Array.from(
            new Map(humanitiesExams.map((e) => [e.name, e])).values(),
        );

        const artsSciencesUnique = Array.from(
            new Map([...artsExamsUnique, ...stemExamsUnique].map((e) => [e.name, e])).values(),
        );

        const fields: SetupField[] = [
            {
                key: "stem-arts",
                label: `Arts and Sciences ${coursesType} Exams`,
                required: false,
                multiple: false,
                type: "string",
                options: artsSciencesUnique.map((e) => ({
                    label: e.name,
                    value: e.name,
                })),
                modal: {
                    title: `Enter ${coursesType} Score`,
                    input: {
                        key: "score",
                        ...SCORE_RANGES[coursesType],
                    },
                },
            },
            {
                key: "humanities",
                label: `Humanities ${coursesType} Exams`,
                required: false,
                multiple: false,
                type: "string",
                options: humanitiesExamsUnique.map((e) => ({
                    label: e.name,
                    value: e.name,
                })),
                modal: {
                    title: `Enter ${coursesType} Score`,
                    input: {
                        key: "score",
                        ...SCORE_RANGES[coursesType],
                    },
                },
            },
        ];

        const advancedCreditExamSetup: SetupSchema = {
            name: `${coursesType} Credit Calculator`,
            type: coursesType,
            fields,
            onComplete: (data) => {
                return buildAdvancedCreditResult(data, exams, coursesType, userSchool as School);
            },
        };

        await new SetupForm(advancedCreditExamSetup, interaction).start();
    },
};

export default command;
