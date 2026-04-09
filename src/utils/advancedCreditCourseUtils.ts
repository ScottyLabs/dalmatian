import { Course, GenEd } from "./index.ts";
import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };

import apCreditData from "../data/advancedCredit/ap-credit.json" with {
    type: "json",
};
import ibCreditData from "../data/advancedCredit/ib-credit.json" with {
    type: "json",
};

import nonOfferedCourses from "../data/nonOfferedCourses.json" with {
    type: "json",
};

export type School = "DC" | "CIT" | "SCS" | "TEP" | "MCS" | "CFA";

export type AdvancedCreditType = "AP" | "IB";

export type Exam = {
    name: string;
    subject: "STEM" | "Arts" | "Humanities" | "N/A";
    school: School[];
    info: string;
    scores: {
        score: number;
        courses: Course[];
    }[];
};

export type AdvancedCreditCourse = {
    id: string;
    name: string;
    units: string;
};

export const SCORE_RANGES = {
    AP: {
        label: "Score (1-5)",
        min: 1,
        max: 5,
    },
    IB: {
        label: "Score (1-7)",
        min: 1,
        max: 7,
    },
};

export async function loadCreditData(
    creditType: AdvancedCreditType,
): Promise<Exam[]> {
    const exams: Exam[] = [];

    const creditData = creditType === "AP" ? apCreditData : ibCreditData;

    const courses = CoursesData as Record<string, Course>;
    const coursesIndex: Record<string, Course> = Object.fromEntries(
        (nonOfferedCourses as AdvancedCreditCourse[]).map((course) => [
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

    for (const entry of creditData) {
        for (const exam of entry.exams) {
            const scoreCourses: Course[] = entry.courses.map((id) => {
                const course = courses[id] ?? coursesIndex[id];

                if (!course) {
                    return {
                        id,
                        name: "Equivalent Course not Found",
                        syllabi: [],
                        desc: "",
                        prereqs: [],
                        prereqString: "",
                        coreqs: [],
                        crosslisted: [],
                        units: "",
                        department: "",
                    };
                } else if (
                    course.name.startsWith("AP") ||
                    course.name.startsWith("IB")
                ) {
                    return {
                        id,
                        name: exam.name + " (*Not Offered Course*)",
                        syllabi: [],
                        desc: "",
                        prereqs: [],
                        prereqString: "",
                        coreqs: [],
                        crosslisted: [],
                        units: course.units,
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

export function getGenedsForCourse(
    courseId: string,
    geneds: GenEd[],
): string[] {
    return geneds.filter((g) => g.courseID === courseId).flatMap((g) => g.tags);
}
