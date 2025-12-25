import { SlashCommandBuilder } from "discord.js";
import apCreditData from "../data/ap-credit.json" with { type: "json" };
import CoursesData from "../data/courses.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import {
    type SetupField,
    SetupForm,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";

// from courses.ts ----------------------------------------------------------
function loadCoursesData(): Record<string, Course> {
    return CoursesData as Record<string, Course>;
}

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
    const courseMap = loadCoursesData(); // map course numbers to Course objects

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
                                return id ? courseMap[id] : null;
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
        .setDescription("Credit Calculator for CMU courses")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ap")
                .setDescription(
                    "Calculate units and courses waived through your APs",
                ),
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === "ap") {
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

            const fields: SetupField[] = [
                {
                    key: "stem",
                    label: "STEM AP Exams",
                    required: false,
                    multiple: true,
                    type: "string",
                    options: stemExamsUnique.map((e) => ({
                        label: e.name,
                        value: e.name,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: {
                            key: "score",
                            label: "Score (1–5)",
                            min: 1,
                            max: 5,
                        },
                    },
                },
                {
                    key: "arts",
                    label: "Arts AP Exams",
                    required: false,
                    multiple: true,
                    type: "string",
                    options: artsExamsUnique.map((e) => ({
                        label: e.name,
                        value: e.name,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: {
                            key: "score",
                            label: "Score (1–5)",
                            min: 1,
                            max: 5,
                        },
                    },
                },
                {
                    key: "humanities",
                    label: "Humanities AP Exams",
                    required: false,
                    multiple: true,
                    type: "string",
                    options: humanitiesExamsUnique.map((e) => ({
                        label: e.name,
                        value: e.name,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: {
                            key: "score",
                            label: "Score (1–5)",
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
                    const awardedCourses: Course[] = [];

                    for (const { examName, score } of data["stem"] ?? []) {
                        const exam = exams.find((e) => e.name === examName);
                        if (!exam) continue;

                        const scoreEntry = exam.scores.find(
                            (s) => s.score === score,
                        );
                        if (!scoreEntry) continue;

                        awardedCourses.push(...scoreEntry.courses);
                    }

                    for (const { examName, score } of data["arts"] ?? []) {
                        const exam = exams.find((e) => e.name === examName);
                        if (!exam) continue;

                        const scoreEntry = exam.scores.find(
                            (s) => s.score === score,
                        );
                        if (!scoreEntry) continue;

                        awardedCourses.push(...scoreEntry.courses);
                    }

                    for (const { examName, score } of data["humanities"] ??
                        []) {
                        const exam = exams.find((e) => e.name === examName);
                        if (!exam) continue;

                        const scoreEntry = exam.scores.find(
                            (s) => s.score === score,
                        );
                        if (!scoreEntry) continue;

                        awardedCourses.push(...scoreEntry.courses);
                    }
                },
            };

            const form = new SetupForm(apExamSetup, interaction);
            await form.start();
        }
    },
};

export default command;
