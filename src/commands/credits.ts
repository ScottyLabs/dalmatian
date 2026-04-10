import {
    ContainerBuilder,
    hyperlink,
    MessageFlags,
    SeparatorBuilder,
    SlashCommandBuilder,
} from "discord.js";
import { DEFAULT_EMBED_COLOR, SCHOOLS, SCOTTYLABS_URL } from "../constants.ts";
import {
    AdvancedCreditType,
    Exam,
    getGenedsForCourse,
    loadCreditData,
    School,
    SCORE_RANGES,
} from "../utils/advancedCreditCourseUtils.ts";

import type { SlashCommand } from "../types.js";
import {
    type SetupField,
    SetupForm,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";

import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import { Course, GenEd } from "../utils/index.ts";
import CITGenedData from "../data/geneds/CITgeneds.json" with { type: "json" };
import DCGenedData from "../data/geneds/DCgeneds.json" with { type: "json" };
import MCSGenedData from "../data/geneds/MCSgeneds.json" with { type: "json" };
import SCSGenedData from "../data/geneds/SCSgeneds.json" with { type: "json" };

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("credits")
        .setDescription("Credit calculator for CMU courses")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ap")
                .setDescription(
                    "Calculate units and courses waived through your APs",
                )
                .addStringOption((option) =>
                    option
                        .setName("school")
                        .setDescription(
                            "Enter College (DC, CIT, SCS, TEP, MCS, CFA)",
                        )
                        .setChoices(SCHOOLS.map((s) => ({ name: s, value: s })))
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ib")
                .setDescription(
                    "Calculate units and courses waived through your IBs",
                )
                .addStringOption((option) =>
                    option
                        .setName("school")
                        .setDescription(
                            "Enter College (DC, CIT, SCS, TEP, MCS, CFA)",
                        )
                        .setChoices(SCHOOLS.map((s) => ({ name: s, value: s })))
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        const coursesType: AdvancedCreditType =
            interaction.options.getSubcommand() === "ap" ? "AP" : "IB";

        const userSchool = interaction.options.getString("school");

        if (!userSchool || !SCHOOLS.includes(userSchool)) {
            console.log(userSchool, SCHOOLS);
            return interaction.reply({
                content: "Acceptable Colleges DC, CIT, SCS, TEP, MCS, CFA",
                flags: MessageFlags.Ephemeral,
            });
        }

        const exams = await loadCreditData(coursesType);

        const stemExams = exams.filter((e) => e.subject === "STEM");
        const artsExams = exams.filter((e) => e.subject === "Arts");
        const humanitiesExams = exams.filter((e) => e.subject === "Humanities");

        const stemExamsUnique = Array.from(
            new Map(stemExams.map((e) => [e.name, e])).values(),
        );

        const artsExamsUnique = Array.from(
            new Map(artsExams.map((e) => [e.name, e])).values(),
        );

        const humanitiesExamsUnique = Array.from(
            new Map(humanitiesExams.map((e) => [e.name, e])).values(),
        );

        const artsSciencesUnique = Array.from(
            new Map(
                [...artsExamsUnique, ...stemExamsUnique].map((e) => [
                    e.name,
                    e,
                ]),
            ).values(),
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
                noDuplicateDataKey: "examName",
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
                noDuplicateDataKey: "examName",
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
            onComplete: async (data) => {
                const courses = CoursesData as Record<string, Course>;
                const awarded: { exam: Exam; courses: Course[] }[] = [];

                const processCategory = (
                    entries: { examName: string; score: number }[],
                ) => {
                    entries.forEach(({ examName, score }) => {
                        const sameName = exams.filter(
                            (e) => e.name === examName,
                        );

                        const chosenExams = (() => {
                            const specific: typeof sameName = [];
                            const general: typeof sameName = [];

                            for (const e of sameName) {
                                if (e.school?.includes(userSchool as School))
                                    specific.push(e);
                                else if (!e.school || e.school.length === 0)
                                    general.push(e);
                            }

                            return specific.length > 0 ? specific : general;
                        })();

                        const results = chosenExams.flatMap((exam) => {
                            const courses = exam.scores
                                .filter((s) => s.score === score)
                                .flatMap((s) => s.courses);

                            return courses.length ? [{ exam, courses }] : [];
                        });

                        awarded.push(...results);
                    });
                };

                processCategory(data["stem-arts"] ?? []);
                processCategory(data["humanities"] ?? []);

                const container = new ContainerBuilder()
                    .setAccentColor(DEFAULT_EMBED_COLOR)
                    .addTextDisplayComponents((t) =>
                        t.setContent(
                            "## Awarded CMU Credit\n*Gened data is incomplete and partly outdated*",
                        ),
                    );

                if (awarded.length === 0) {
                    container.addTextDisplayComponents((t) =>
                        t.setContent(
                            "No credit awarded based on the selected exams.",
                        ),
                    );
                    return container;
                }

                let genedCreditTotal = 0;

                const allAwardedCourse: Set<Course> = new Set();

                for (const { exam, courses: awardedCourses } of awarded) {
                    let geneds: GenEd[] = [];

                    if (userSchool == "DC") {
                        geneds = DCGenedData as GenEd[];
                    } else if (userSchool == "CIT") {
                        geneds = CITGenedData as GenEd[];
                    } else if (userSchool == "MCS") {
                        geneds = MCSGenedData as GenEd[];
                    } else if (userSchool == "SCS") {
                        geneds = SCSGenedData as GenEd[];
                    } else if (userSchool == "CFA" || userSchool == "TEP") {
                        container.addTextDisplayComponents((t) =>
                            t.setContent(
                                `Gened data not available for ${userSchool}`,
                            ),
                        );
                    }

                    for (const course of awardedCourses) {
                        if (allAwardedCourse.has(course)) continue;

                        allAwardedCourse.add(course);

                        container.addSeparatorComponents(
                            new SeparatorBuilder(),
                        );

                        const units = Number(course.units) || 0;
                        genedCreditTotal += units;

                        const courseName =
                            courses[course.id]?.name ?? course.name;

                        const genedList =
                            geneds && course.id
                                ? getGenedsForCourse(course.id, geneds)
                                : [];

                        const genedTags = genedList.length
                            ? genedList.map((g) => `${g}`).join(" ")
                            : "n/a";

                        container.addTextDisplayComponents((t) =>
                            t.setContent(
                                [
                                    courseName.endsWith(
                                        "(*Not Offered Course*)",
                                    )
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
                            ),
                        );
                    }
                }

                container.addTextDisplayComponents((t) =>
                    t.setContent(`**Unit Total:** ${genedCreditTotal}`),
                );
                return container;
            },
        };

        await new SetupForm(advancedCreditExamSetup, interaction).start();
    },
};

export default command;
