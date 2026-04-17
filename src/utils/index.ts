import CoursesData from "../data/finalCourseJSON.json" with { type: "json" };

export type Session = {
    term: string;
    section: string;
    instructors: string[];
    url: string;
};

export type Course = {
    id: string;
    name: string;
    syllabi: Session[];
    desc: string;
    prereqs: string[];
    prereqString: string;
    coreqs: string[];
    crosslisted: string[];
    units: string;
    department: string;
};

export type GenEd = {
    tags: string[];
    courseID: string;
    school: string;
    lastUpdated: string;
    startsCounting: string;
    stopsCounting: string;
};

export const COURSES_DATA = CoursesData as Record<string, Course>;

export function formatCourseNumber(courseNumber: string): string | null {
    if (courseNumber.match(/^\d{2}(-| )?\d{3}$/)) {
        if (courseNumber.includes("-")) {
            return courseNumber;
        }

        if (courseNumber.includes(" ")) {
            return `${courseNumber.slice(0, 2)}-${courseNumber.slice(3)}`;
        }

        return `${courseNumber.slice(0, 2)}-${courseNumber.slice(2)}`;
    }

    return null;
}
