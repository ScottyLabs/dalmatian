import {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SlashCommandBuilder,
} from "discord.js";
import { SCHOOLS } from "../constants.js";
import apCoursesData from "../data/ap-courses.json" with { type: "json" };
import apCreditData from "../data/ap-credit.json" with { type: "json" };
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };
import CITGenedData from "../data/geneds/CITgeneds.json" with { type: "json" };
import DCGenedData from "../data/geneds/DCgeneds.json" with { type: "json" };
import MCSGenedData from "../data/geneds/MCSgeneds.json" with { type: "json" };
import SCSGenedData from "../data/geneds/SCSgeneds.json" with { type: "json" };
import type { SlashCommand } from "../types.d.ts";
import {
    type SetupField,
    SetupForm,
    type SetupSchema,
} from "../utils/creditCalculatorForm.ts";
import { Course, GenEd } from "../utils/index.ts";

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

type ApCourse = {
    id: string;
    name: string;
    units: string;
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
    const apCoursesIndex: Record<string, Course> = Object.fromEntries(
        (apCoursesData as ApCourse[]).map((course) => [
            course.id,
            {
                id: course.id,
                name: course.name,
                units: course.units,
                syllabi: [],
                desc: "",
                prereqs: [],
                prereqString: "",
                coreqs: [],
                crosslisted: [],
                department: "",
            },
        ]),
    );

    for (const entry of apCreditData) {
        for (const exam of entry.exams) {
            const scoreCourses: Course[] = entry.courses.map((id) => {
                let course = courses[id];

                if (!course) {
                    course = apCoursesIndex[id];
                }

                if (!course) {
                    return {
                        id,
                        name: exam.name,
                        syllabi: [],
                        desc: "",
                        prereqs: [],
                        prereqString: "",
                        coreqs: [],
                        crosslisted: [],
                        units: "",
                        department: "",
                    };
                }

                return course;
            });

            exams.push({
                name: exam.name,
                subject: entry.subject as
                    | "STEM"
                    | "Arts"
                    | "Humanities"
                    | "N/A",
                school: normalizeSchool(entry.school) ?? undefined,
                info: entry.info?.trim() || "N/A",
                scores: [
                    {
                        score: exam.score,
                        courses: scoreCourses,
                    },
                ],
            });
        }
    }
    return exams;
}

function getGenedsForCourse(courseId: string, geneds: GenEd[]): string[] {
    return geneds.filter((g) => g.courseID === courseId).flatMap((g) => g.tags);
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

            if (!userSchool || !SCHOOLS.includes(userSchool)) {
                console.log(userSchool, SCHOOLS);
                return interaction.reply({
                    content: "Acceptable Colleges DC, CIT, SCS, TEP, MCS, CFA",
                    flags: MessageFlags.Ephemeral,
                });
            }
            console.log(userSchool, SCHOOLS);

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

                    let genedCreditTotal = 0;

                    for (const { exam, courses: awardedCourses } of awarded) {
                        container.addSeparatorComponents(
                            new SeparatorBuilder(),
                        );

                        container.addTextDisplayComponents((t) =>
                            t.setContent(`### ${exam.name}`),
                        );

                        let geneds: GenEd[] | null = null;

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
                            const units = Number(course.units) || 0;
                            genedCreditTotal += units;

                            const courseName =
                                courses[course.id]?.name ?? course.name;

                            const genedList =
                                geneds && course.id
                                    ? getGenedsForCourse(course.id, geneds)
                                    : [];

                            const genedTags = genedList.length
                                ? genedList.map((g) => `[${g}]`).join(" ")
                                : "_None_";

                            container.addTextDisplayComponents((t) =>
                                t.setContent(
                                    [
                                        `> **${course.id}** — ${courseName}`,
                                        `> **${units} units** · GenEds: ${genedTags}`,
                                    ].join("\n"),
                                ),
                            );
                        }
                        if (exam.info !== undefined) {
                            container.addTextDisplayComponents((t) =>
                                t.setContent(`note: ${exam.info}`),
                            );
                        }
                    }

                    container.addTextDisplayComponents((t) =>
                        t.setContent(
                            `**GenEd Unit Total:** ${genedCreditTotal}`,
                        ),
                    );
                    return container;
                },
            };

            const form = new SetupForm(apExamSetup, interaction);
            await form.start();
        }
    },
};

export default command;
