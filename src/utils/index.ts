import CoursesData from "../data/courseCatalog.json" with { type: "json" };
import { search } from "fast-fuzzy";

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

export function queryCourse(input: string): Course[] {
    const entries = Object.values(COURSES_DATA);
    
    input = input.toLowerCase().trim();
    if (!input) return entries;

    // if actively typing a course code (but in wrong format), normalize it
    if (/^\d{3,5}$/.test(input)) 
        input = `${input.slice(0, 2)}-${input.slice(2)}`;
    else if (/^\d{2}\s\d{1,3}$/.test(input)) 
        input = `${input.slice(0, 2)}-${input.slice(3)}`;

    return search(input, entries, {
        keySelector: (course) => `${course.id} ${course.name}`,
    });
}
