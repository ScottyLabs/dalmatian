import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { evaluatePrereq, fetchOtherCoursePrereqsNum } from "../src/commands/unlocks.ts";
import { type Course } from "../src/utils/index.ts";

const baseCourse: Course = {
    id: "00-000",
    name: "",
    desc: "",
    prereqs: [],
    prereqString: "",
    coreqs: [],
    crosslisted: [],
    units: "9",
    department: "Mechanical Engineering",
};

function makeCourse(overrides: Partial<Course>): Course {
    return { ...baseCourse, ...overrides };
}

describe("evaluatePrereq", () => {
    test("returns true for a matching single prerequisite", () => {
        expect(evaluatePrereq("24-101", ["24-101"])).toBe(true);
    });

    test("evaluates AND prerequisites", () => {
        expect(evaluatePrereq("21-260 and 24-101", ["21-260", "24-101"])).toBe(true);
        expect(evaluatePrereq("21-260 and 24-101", ["24-101"])).toBe(false);
    });

    test("evaluates OR prerequisites", () => {
        expect(evaluatePrereq("33-141 or 33-151", ["33-151"])).toBe(true);
        expect(evaluatePrereq("33-141 or 33-151", [])).toBe(false);
    });

    test("evaluates parenthesized expressions", () => {
        expect(evaluatePrereq("(33-141 or 33-151) and 24-101", ["33-151", "24-101"])).toBe(true);
        expect(evaluatePrereq("(33-141 or 33-151) and 24-101", ["33-141"])).toBe(false);
    });

    test("supports course codes containing spaces", () => {
        expect(evaluatePrereq("21 260", ["21 260"])).toBe(true);
    });

    test("returns false for malformed expressions", () => {
        expect(evaluatePrereq("24-101 and", ["24-101"])).toBe(false);
    });
});

describe("fetchOtherCoursePrereqsNum", () => {
    const prereq = makeCourse({ id: "24-101" });

    test("returns -1 when the given course is not a prerequisite", () => {
        const course = makeCourse({
            id: "15-122",
            prereqs: ["15-112"],
            prereqString: "15-112",
        });

        expect(fetchOtherCoursePrereqsNum(course, prereq)).toBe(-1);
    });

    test("returns 0 when the given course is the only prerequisite", () => {
        const course = makeCourse({
            id: "24-203",
            prereqs: ["24-101"],
            prereqString: "24-101",
        });

        expect(fetchOtherCoursePrereqsNum(course, prereq)).toBe(0);
    });

    test("returns the number of additional prerequisites required", () => {
        const course = makeCourse({
            id: "24-351",
            prereqs: ["21-260", "24-101"],
            prereqString: "21-260 and 24-101",
        });

        expect(fetchOtherCoursePrereqsNum(course, prereq)).toBe(1);
    });
    test("returns the number of additional prerequisites required (larger)", () => {
        const course = makeCourse({
            id: "24-221",
            prereqs: ["33-141", "33-151", "33-121", "33-106", "21-122", "24-101"],
            prereqString: "(33-141 or 33-151 or 33-121 or 33-106) and (21-122) and (24-101)",
        });

        expect(fetchOtherCoursePrereqsNum(course, prereq)).toBe(2);
    });
});
