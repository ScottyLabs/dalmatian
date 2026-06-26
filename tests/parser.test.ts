import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { type Course, formatCourseNumber } from "../src/utils/index.ts";
import {
    BasicOperatorExecutionContext,
    parseAndEvaluate,
} from "../src/utils/parser/basicOperatorParser.ts";
import {
    MaxCallDepthExceededError,
    ParserError,
    UnexpectedEndOfInputError,
    UnexpectedTokenError,
} from "../src/utils/parser/errors.ts";

function make<T>(base: T, overrides: Partial<T> = {}): T {
    return { ...base, ...overrides };
}

const baseCourse: Course = {
    id: "00-000",
    name: "",
    syllabi: [],
    desc: "",
    prereqs: [],
    prereqString: "",
    coreqs: [],
    crosslisted: [],
    units: "9",
    department: "Computer Science",
};

const coursesData: Record<string, Course> = {
    "15-112": make(baseCourse, {
        id: "15-112",
        name: "Fundamentals of Programming",
    }),
    "15-122": make(baseCourse, {
        id: "15-122",
        name: "Principles of Imperative Computation",
        prereqs: ["15-112"],
    }),
    "15-150": make(baseCourse, {
        id: "15-150",
        name: "Principles of Functional Programming",
        prereqs: ["15-122", "21-127"],
    }),
    "15-213": make(baseCourse, {
        id: "15-213",
        name: "Introduction to Computer Systems",
        prereqs: ["15-122"],
    }),
    "21-127": make(baseCourse, {
        id: "21-127",
        name: "Concepts of Mathematics",
        prereqs: ["15-112"],
    }),
    "21-241": make(baseCourse, {
        id: "21-241",
        name: "Matrices and Linear Transformations",
        prereqs: ["21-127"],
    }),
    "76-101": make(baseCourse, {
        id: "76-101",
        name: "Interpretation and Argument",
    }),
};

const ALL_IDS = Object.keys(coursesData).sort();

function fetchCourseUnlocks(courseData: Record<string, Course>, courseNumber: string): Course[] {
    const unlocks: Course[] = [];

    for (const course of Object.values(courseData)) {
        if (course.prereqs.includes(courseNumber)) {
            unlocks.push(course);
        }
    }

    return unlocks;
}

function makeContext(): BasicOperatorExecutionContext<string, Course> {
    function parseLiteral(value: string): string {
        return value;
    }

    function lookup(value: string): Course[] {
        const courseCode = formatCourseNumber(value);

        if (!courseCode || !coursesData[courseCode]) {
            throw new Error(`Course not found: ${value}`);
        }

        return fetchCourseUnlocks(coursesData, courseCode).map(
            (course) => ({ id: course.id, name: course.name }) as Course,
        );
    }

    function equals(a: Course, b: Course): boolean {
        return a.id === b.id;
    }

    function universe(): Course[] {
        return Object.values(coursesData).map(
            (course) => ({ id: course.id, name: course.name }) as Course,
        );
    }

    return new BasicOperatorExecutionContext<string, Course>(
        parseLiteral,
        lookup,
        equals,
        universe,
    );
}

function run(input: string): Course[] {
    return parseAndEvaluate<string, Course>(input, makeContext());
}

function ids(input: string): string[] {
    return run(input)
        .map((c) => c.id)
        .sort();
}

function caught(input: string): unknown {
    try {
        run(input);
    } catch (error) {
        return error;
    }
    throw new Error(`expected "${input}" to throw, but it did not`);
}

describe("boolean expressions - AND (intersection)", () => {
    test("intersects the two operands", () => {
        expect(ids("15-122 AND 21-127")).toEqual(["15-150"]);
    });

    test("disjoint operands yield the empty set", () => {
        expect(ids("15-112 AND 21-127")).toEqual([]);
    });

    test("intersecting with the empty set is empty", () => {
        expect(ids("15-122 AND 76-101")).toEqual([]);
    });

    test("is idempotent", () => {
        expect(ids("15-122 AND 15-122")).toEqual(["15-150", "15-213"]);
    });

    test("chains left-to-right", () => {
        expect(ids("15-122 AND 21-127 AND 15-112")).toEqual([]);
    });
});

describe("boolean expressions - OR (union)", () => {
    test("unions the two operands", () => {
        expect(ids("15-122 OR 21-127")).toEqual(["15-150", "15-213", "21-241"]);
    });

    test("deduplicates overlapping results", () => {
        expect(ids("15-122 OR 15-122")).toEqual(["15-150", "15-213"]);
    });

    test("union with the empty set is the other operand", () => {
        expect(ids("15-122 OR 76-101")).toEqual(["15-150", "15-213"]);
    });

    test("chains across three operands", () => {
        expect(ids("15-112 OR 15-122 OR 21-127")).toEqual([
            "15-122",
            "15-150",
            "15-213",
            "21-127",
            "21-241",
        ]);
    });
});

describe("boolean expressions - NOT (complement)", () => {
    test("returns the universe minus the operand", () => {
        expect(ids("NOT 15-122")).toEqual(["15-112", "15-122", "21-127", "21-241", "76-101"]);
    });

    test("complement of the empty set is the whole universe", () => {
        expect(ids("NOT 76-101")).toEqual(ALL_IDS);
    });

    test("double negation is identity", () => {
        expect(ids("NOT NOT 15-122")).toEqual(["15-150", "15-213"]);
    });
});

describe("boolean expressions - precedence", () => {
    test("AND binds tighter than OR", () => {
        expect(ids("15-112 OR 15-122 AND 21-127")).toEqual(["15-122", "15-150", "21-127"]);
    });

    test("NOT binds tighter than AND", () => {
        expect(ids("NOT 15-122 AND 21-127")).toEqual(["21-241"]);
    });

    test("NOT binds tighter than OR", () => {
        expect(ids("NOT 15-112 OR 15-122")).toEqual([
            "15-112",
            "15-150",
            "15-213",
            "21-241",
            "76-101",
        ]);
    });

    test("parentheses override precedence", () => {
        expect(ids("(15-112 OR 15-122) AND 21-127")).toEqual(["15-150"]);
    });

    test("redundant parentheses do not change the result", () => {
        expect(ids("((15-122))")).toEqual(ids("15-122"));
        expect(ids("(15-122 AND 21-127)")).toEqual(ids("15-122 AND 21-127"));
    });
});

describe("boolean expressions - algebraic laws", () => {
    test("De Morgan: NOT(a OR b) = NOT a AND NOT b", () => {
        expect(ids("NOT (15-122 OR 21-127)")).toEqual(ids("NOT 15-122 AND NOT 21-127"));
    });

    test("De Morgan: NOT(a AND b) = NOT a OR NOT b", () => {
        expect(ids("NOT (15-122 AND 21-127)")).toEqual(ids("NOT 15-122 OR NOT 21-127"));
    });

    test("law of excluded middle: a OR NOT a = universe", () => {
        expect(ids("15-122 OR NOT 15-122")).toEqual(ALL_IDS);
    });

    test("non-contradiction: a AND NOT a = empty", () => {
        expect(ids("15-122 AND NOT 15-122")).toEqual([]);
    });

    test("AND distributes over OR", () => {
        expect(ids("15-122 AND (21-127 OR 15-112)")).toEqual(
            ids("(15-122 AND 21-127) OR (15-122 AND 15-112)"),
        );
    });

    test("operands commute", () => {
        expect(ids("15-122 AND 21-127")).toEqual(ids("21-127 AND 15-122"));
        expect(ids("15-122 OR 21-127")).toEqual(ids("21-127 OR 15-122"));
    });
});

describe("boolean expressions - structural errors", () => {
    test("empty input", () => {
        expect(caught("")).toBeInstanceOf(UnexpectedEndOfInputError);
    });

    test("whitespace-only input", () => {
        expect(caught("   ")).toBeInstanceOf(UnexpectedEndOfInputError);
    });

    test("leading binary operator", () => {
        expect(caught("AND 15-112")).toBeInstanceOf(UnexpectedTokenError);
    });

    test("trailing binary operator", () => {
        expect(caught("15-112 AND")).toBeInstanceOf(UnexpectedEndOfInputError);
    });

    test("dangling NOT", () => {
        expect(caught("NOT")).toBeInstanceOf(UnexpectedEndOfInputError);
    });

    test("NOT cannot be used as an infix operator", () => {
        expect(caught("15-112 NOT 21-127")).toBeInstanceOf(UnexpectedTokenError);
    });

    test("two adjacent operands without an operator", () => {
        expect(caught("(15-112) (21-127)")).toBeInstanceOf(UnexpectedTokenError);
    });

    test("unclosed parenthesis", () => {
        expect(caught("(15-112")).toBeInstanceOf(UnexpectedEndOfInputError);
    });

    test("unmatched closing parenthesis", () => {
        expect(caught("15-112)")).toBeInstanceOf(UnexpectedTokenError);
    });

    test("empty parentheses", () => {
        expect(caught("()")).toBeInstanceOf(UnexpectedTokenError);
    });

    test("errors carry a source location", () => {
        const error = caught("(15-112) (21-127)");
        expect(error).toBeInstanceOf(ParserError);
        expect((error as ParserError).sourceLocation.index).toBeGreaterThanOrEqual(0);
    });
});

describe("boolean expressions - limits", () => {
    test("deeply nested parentheses exceed the max parse depth", () => {
        const depth = 200;
        const input = "(".repeat(depth) + "15-112" + ")".repeat(depth);
        expect(caught(input)).toBeInstanceOf(MaxCallDepthExceededError);
    });
});
