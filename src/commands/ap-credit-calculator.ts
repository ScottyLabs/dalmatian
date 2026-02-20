import {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SlashCommandBuilder,
} from "discord.js";
import { DEFAULT_EMBED_COLOR, SCHOOLS } from "../constants.js";
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
    school: School[];
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
                const course = courses[id] ?? apCoursesIndex[id];

                if (!course || course.name.startsWith("AP")) {
                    return {
                        id,
                        name: exam.name + " (*Not Offered Course*)",
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
                school: entry.school as School[],
                info: entry.info?.trim() || "",
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
                        entries.forEach(({ examName, score }) => {
                            const sameName = exams.filter(
                                (e) => e.name === examName,
                            );

                            const chosenExams = (() => {
                                const specific: typeof sameName = [];
                                const general: typeof sameName = [];

                                for (const e of sameName) {
                                    if (
                                        e.school?.includes(userSchool as School)
                                    )
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

                                return courses.length
                                    ? [{ exam, courses }]
                                    : [];
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

                    for (const { exam, courses: awardedCourses } of awarded) {
                        container.addSeparatorComponents(
                            new SeparatorBuilder(),
                        );

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
                                : "n/a";

                            container.addTextDisplayComponents((t) =>
                                t.setContent(
                                    [
                                        courseName.endsWith(
                                            "(*Not Offered Course*)",
                                        )
                                            ? `**${course.id}** — AP ${courseName} (${units} units)`
                                            : `**${course.id}** — ${courseName} (${units} units)`,
                                        genedTags != "n/a"
                                            ? `AP ${exam.name}· Fulfills ${genedTags} Gened Requirement.`
                                            : `AP ${exam.name}`,
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

            await new SetupForm(apExamSetup, interaction).start();
        }
    },
};

export default command;
