import {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SlashCommandBuilder,
} from "discord.js";
import apCreditData from "../data/ap-credit.json" with { type: "json" };
import CoursesData from "../data/courses.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import {
    type SetupField,
    SetupForm,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";

// from courses.ts ----------------------------------------------------------
function formatCourseNumber(courseNumber: string): string | null {
    if (courseNumber.match(/^\d{2}-?\d{3}$/)) {
        if (courseNumber.includes("-")) {
            return courseNumber;
        } else {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(2)}`;
        }
    }

    return null;
}
// --------------------------------------------------------------------------

type School = "DC" | "CIT" | "SCS" | "TEP" | "MCS" | "CFA";

type Course = {
    id: string;
    name: string;
};

type Exam = {
    name: string;
    subject: "STEM" | "Arts" | "Humanities" | "N/A";
    school?: School[];
    info: string;
    scores: {
        score: number;
        courses: Course[];
    }[];
};

function normalizeSchool(
    school: string | string[] | undefined,
): School[] | undefined {
    if (!school) return undefined;

    const schools = Array.isArray(school) ? school : [school];

    return schools.filter(
        (s): s is School =>
            s === "DC" ||
            s === "CIT" ||
            s === "SCS" ||
            s === "TEP" ||
            s === "MCS" ||
            s === "CFA",
    );
}

async function loadApCreditData(): Promise<Exam[]> {
    const exams: Exam[] = [];
    
    const courses = CoursesData as Record<string, Course>;

    for (const entry of apCreditData) {
        for (const exam of entry.exams) {
            const examObj: Exam = {
                name: exam.name,
                subject: entry.subject as
                    | "STEM"
                    | "Arts"
                    | "Humanities"
                    | "N/A",
                school: normalizeSchool(entry.school),
                info: entry.info as string,
                scores: [
                    {
                        score: exam.score,
                        courses: entry.courses
                            .map((c) => {
                                const id = formatCourseNumber(c);
                                return id ? courses[id] : null;
                            })
                            .filter((c): c is Course => c !== null),
                    },
                ],
            };

            exams.push(examObj);
        }
    }

    return exams;
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("credit-calculator")
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
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === "ap") {
            const userSchool = interaction.options.getString("school");

            if (
                !userSchool ||
                userSchool in ["DC", "CIT", "SCS", "TEP", "MCS", "CFA"]
            ) {
                return interaction.reply({
                    content: "Acceptable Colleges DC, CIT, SCS, TEP, MCS, CFA",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const exams = await loadApCreditData();

            const stemExams = exams.filter((e) => e.subject === "STEM");
            const artsExams = exams.filter((e) => e.subject === "Arts");
            const humanitiesExams = exams.filter(
                (e) => e.subject === "Humanities",
            );

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
                    label: "Arts and Sciences AP Exams",
                    required: false,
                    multiple: false,
                    type: "string",
                    options: artsSciencesUnique.map((e) => ({
                        label: e.name,
                        value: e.name,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: {
                            key: "score",
                            label: "Score (1-5)",
                            min: 1,
                            max: 5,
                        },
                    },
                },
                {
                    key: "humanities",
                    label: "Humanities AP Exams",
                    required: false,
                    multiple: false,
                    type: "string",
                    options: humanitiesExamsUnique.map((e) => ({
                        label: e.name,
                        value: e.name,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: {
                            key: "score",
                            label: "Score (1-5)",
                            min: 1,
                            max: 5,
                        },
                    },
                },
            ];

            const apExamSetup: SetupSchema = {
                name: "AP Credit Calculator",
                fields,
                onComplete: async (data) => {
                    const courses = CoursesData as Record<string, Course>;

                    const awardedMap = new Map<string, Exam>();

                    const processCategory = (
                        entries: { examName: string; score: number }[],
                    ) => {
                        for (const { examName, score } of entries) {
                            const exam = exams.find((e) => e.name === examName);
                            if (!exam) continue;

                            if (
                                exam.school &&
                                !exam.school.includes(
                                    userSchool as
                                        | "DC"
                                        | "CIT"
                                        | "SCS"
                                        | "TEP"
                                        | "MCS"
                                        | "CFA",
                                )
                            ) {
                                continue;
                            }

                            const scoreEntry = exam.scores.find(
                                (s) => s.score === score,
                            );
                            if (!scoreEntry || scoreEntry.courses.length === 0)
                                continue;

                            if (!awardedMap.has(exam.name)) {
                                awardedMap.set(exam.name, {
                                    ...exam,
                                    scores: [
                                        {
                                            score,
                                            courses: scoreEntry.courses,
                                        },
                                    ],
                                });
                            }
                        }
                    };

                    processCategory(data["stem"] ?? []);
                    processCategory(data["arts"] ?? []);
                    processCategory(data["humanities"] ?? []);

                    const awarded: Exam[] = [...awardedMap.values()];

                    const container = new ContainerBuilder()
                        .setAccentColor(0x3b82f6)
                        .addTextDisplayComponents((t) =>
                            t.setContent("Awarded CMU Credit"),
                        );

                    if (awarded.length === 0) {
                        container.addTextDisplayComponents((t) =>
                            t.setContent(
                                "No credit awarded based on the selected exams.",
                            ),
                        );

                        return container;
                    }

                    for (const exam of awarded) {
                        container.addSeparatorComponents(
                            new SeparatorBuilder(),
                        );

                        container.addTextDisplayComponents((t) =>
                            t.setContent(`### ${exam.name}\n${exam.info}`),
                        );

                        const awardedCourses = exam.scores[0]?.courses ?? [];

                        for (const course of awardedCourses) {
                            if (course.id in courses) continue
                            container.addTextDisplayComponents((t) =>
                                t.setContent(
                                    `> **${course.id}** — ${courses[course.id]!.name}`,
                                ),
                            );
                        }
                    }

                    return container;
                },
            };

            const form = new SetupForm(apExamSetup, interaction);
            await form.start();
        }
    },
};

export default command;
