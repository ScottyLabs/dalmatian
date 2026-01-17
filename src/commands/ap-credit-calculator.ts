import {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SlashCommandBuilder,
} from "discord.js";
import apCreditData from "../data/ap-credit.json" with { type: "json" };
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import {
    type SetupField,
    SetupForm,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";
import { Course } from "../utils/index.ts";

type School = "DC" | "CIT" | "SCS" | "TEP" | "MCS" | "CFA";

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
            const scoreCourses: Course[] = entry.courses
                .map((id) => {
                    const course = courses[id];
                    if (!course) {
                        return {
                            id,
                            name: exam.name,
                        } as Course;
                    }
                    return course;
                })
                .filter((c): c is Course => c !== null);

            const examObj: Exam = {
                name: exam.name,
                subject: entry.subject as
                    | "STEM"
                    | "Arts"
                    | "Humanities"
                    | "N/A",
                school: normalizeSchool(entry.school) ?? undefined,
                info: entry.info ?? "",
                scores: [
                    {
                        score: exam.score,
                        courses: scoreCourses,
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
                    const awarded: { exam: Exam; courses: Course[] }[] = [];

                    const processCategory = (
                        entries: { examName: string; score: number }[],
                    ) => {
                        for (const { examName, score } of entries) {
                            const matchingExams = exams.filter(
                                (e) =>
                                    e.name === examName &&
                                    (!e.school ||
                                        e.school.includes(
                                            userSchool as School,
                                        )),
                            );

                            for (const exam of matchingExams) {
                                const matchingCourses: Course[] = [];
                                for (const s of exam.scores) {
                                    if (s.score === score) {
                                        matchingCourses.push(...s.courses);
                                    }
                                }
                                if (matchingCourses.length > 0) {
                                    awarded.push({
                                        exam,
                                        courses: matchingCourses,
                                    });
                                }
                            }
                        }
                    };

                    processCategory(data["stem-arts"] ?? []);
                    processCategory(data["humanities"] ?? []);

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

                    for (const { exam, courses: awardedCourses } of awarded) {
                        container.addSeparatorComponents(
                            new SeparatorBuilder(),
                        );

                        container.addTextDisplayComponents((t) =>
                            t.setContent(`### ${exam.name}`),
                        );

                        for (const course of awardedCourses) {
                            if (!(course.id in courses) || !course?.id) {
                                container.addTextDisplayComponents((t) =>
                                    t.setContent(
                                        `> **${course.id}** — AP ${course.name}`,
                                    ),
                                );
                                continue;
                            }

                            container.addTextDisplayComponents((t) =>
                                t.setContent(
                                    `> **${course.id}** — ${courses[course.id]!.name}`,
                                ),
                            );
                        }

                        if (exam.info != undefined) {
                            container.addTextDisplayComponents((t) =>
                                t.setContent(`note: ${exam.info}`),
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
