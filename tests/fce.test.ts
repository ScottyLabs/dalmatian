import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { FYW_MINIS } from "../src/constants.ts";
import {
    buildFCEData,
    calculateTotalUnits,
    calculateTotalWorkload,
    type FCERecord,
    type FCERecordSummary,
    summarizeFCERecords,
} from "../src/utils/fceCache.ts";

function make<T>(base: T, overrides: Partial<T> = {}): T {
    return { ...base, ...overrides };
}

const baseFceRecord: FCERecord = {
    section: "A",
    instructor: "Instructor",
    semesterLabel: "F24",
    hrsPerWeek: 0,
    overallTeachingRate: 0,
    overallCourseRate: 0,
    responseRate: 0,
};

const baseSummary: FCERecordSummary = {
    teachingRate: 0,
    courseRate: 0,
    workload: 0,
    responseRate: 0,
    semesterLabels: [],
};

const baseCsvRecord: Record<string, string> = {
    Dept: "CMU",
    Num: "98008",
    Sem: "Fall",
    Year: "2026",
    "Hrs Per Week": "0",
    "Overall teaching rate": "0",
    "Overall course rate": "0",
    "Response Rate": "0",
    "Course Name": "Intro to Rust Lang",
    Instructor: "Ferris",
    Section: "A",
};

describe("summarizeFCERecords", () => {
    test("ignores summer when fall/spring exist", () => {
        const summary = summarizeFCERecords([
            make(baseFceRecord, {
                semesterLabel: "F24",
                overallTeachingRate: 4,
                overallCourseRate: 3,
                hrsPerWeek: 10,
                responseRate: 80,
            }),
            make(baseFceRecord, {
                semesterLabel: "S25",
                overallTeachingRate: 2,
                overallCourseRate: 4,
                hrsPerWeek: 12,
                responseRate: 90,
            }),
            make(baseFceRecord, {
                semesterLabel: "M25",
                overallTeachingRate: 5,
                overallCourseRate: 5,
                hrsPerWeek: 20,
                responseRate: 100,
            }),
        ]);

        expect(summary.teachingRate).toBeCloseTo(3);
        expect(summary.courseRate).toBeCloseTo(3.5);
        expect(summary.workload).toBeCloseTo(11);
        expect(summary.responseRate).toBeCloseTo(85);
    });

    test("averages fall/spring only", () => {
        const summary = summarizeFCERecords([
            make(baseFceRecord, {
                semesterLabel: "F23",
                overallTeachingRate: 3,
                overallCourseRate: 4,
                hrsPerWeek: 8,
                responseRate: 70,
            }),
            make(baseFceRecord, {
                semesterLabel: "S24",
                overallTeachingRate: 5,
                overallCourseRate: 2,
                hrsPerWeek: 12,
                responseRate: 90,
            }),
        ]);

        expect(summary.teachingRate).toBeCloseTo(4, 5);
        expect(summary.courseRate).toBeCloseTo(3, 5);
        expect(summary.workload).toBeCloseTo(10, 5);
        expect(summary.responseRate).toBeCloseTo(80, 5);
    });

    test("includes summer-only offerings", () => {
        const summary = summarizeFCERecords([
            make(baseFceRecord, {
                semesterLabel: "M24",
                overallTeachingRate: 4,
                overallCourseRate: 2,
                hrsPerWeek: 6,
                responseRate: 60,
            }),
            make(baseFceRecord, {
                semesterLabel: "M25",
                overallTeachingRate: 2,
                overallCourseRate: 4,
                hrsPerWeek: 10,
                responseRate: 80,
            }),
        ]);

        expect(summary.teachingRate).toBeCloseTo(3, 5);
        expect(summary.courseRate).toBeCloseTo(3, 5);
        expect(summary.workload).toBeCloseTo(8, 5);
        expect(summary.responseRate).toBeCloseTo(70, 5);
    });

    test("only uses records from the past 5 years", () => {
        const data = buildFCEData(
            [
                make(baseCsvRecord, {
                    Year: "2020",
                    Sem: "Fall",
                    "Overall teaching rate": "1",
                    "Overall course rate": "1",
                    "Hrs Per Week": "5",
                    "Response Rate": "50",
                }),
                make(baseCsvRecord, {
                    Year: "2021",
                    Sem: "Fall",
                    "Overall teaching rate": "2",
                    "Overall course rate": "2",
                    "Hrs Per Week": "6",
                    "Response Rate": "60",
                }),
                make(baseCsvRecord, {
                    Year: "2023",
                    Sem: "Spring",
                    "Overall teaching rate": "4",
                    "Overall course rate": "3",
                    "Hrs Per Week": "10",
                    "Response Rate": "80",
                }),
                make(baseCsvRecord, {
                    Year: "2026",
                    Sem: "Fall",
                    "Overall teaching rate": "5",
                    "Overall course rate": "4",
                    "Hrs Per Week": "20",
                    "Response Rate": "90",
                }),
            ],
            2026,
        );

        const course = data["98-008"];
        expect(course).toBeDefined();
        expect(course?.records.length).toBe(3);

        const summary = summarizeFCERecords(course?.records ?? []);
        expect(summary.teachingRate).toBeCloseTo(11 / 3, 5);
        expect(summary.courseRate).toBeCloseTo(3, 5);
        expect(summary.workload).toBeCloseTo(12, 5);
        expect(summary.responseRate).toBeCloseTo(230 / 3, 5);
    });
});

describe("calculateTotalWorkload", () => {
    test("averages two FYW minis", () => {
        const summaryByCourseCode = new Map<string, FCERecordSummary>([
            [FYW_MINIS[0]!, make(baseSummary, { workload: 8 })],
            [FYW_MINIS[1]!, make(baseSummary, { workload: 12 })],
            ["98-008", make(baseSummary, { workload: 2 })],
        ]);

        const { totalWorkload, fywMinisAveraged } = calculateTotalWorkload(
            [FYW_MINIS[0]!, FYW_MINIS[1]!, "98-008"],
            summaryByCourseCode,
            FYW_MINIS,
        );

        expect(fywMinisAveraged).toBe(true);
        expect(totalWorkload).toBeCloseTo(12, 5);
    });

    test("does not average one FYW mini", () => {
        const summaryByCourseCode = new Map<string, FCERecordSummary>([
            [FYW_MINIS[0]!, make(baseSummary, { workload: 7 })],
            ["98-008", make(baseSummary, { workload: 5 })],
        ]);

        const { totalWorkload, fywMinisAveraged } = calculateTotalWorkload(
            [FYW_MINIS[0]!, "98-008"],
            summaryByCourseCode,
            FYW_MINIS,
        );

        expect(fywMinisAveraged).toBe(false);
        expect(totalWorkload).toBeCloseTo(12, 5);
    });

    test("does not average three FYW minis", () => {
        const summaryByCourseCode = new Map<string, FCERecordSummary>([
            [FYW_MINIS[0]!, make(baseSummary, { workload: 4 })],
            [FYW_MINIS[1]!, make(baseSummary, { workload: 6 })],
            [FYW_MINIS[2]!, make(baseSummary, { workload: 8 })],
            ["98-008", make(baseSummary, { workload: 2 })],
        ]);

        const { totalWorkload, fywMinisAveraged } = calculateTotalWorkload(
            [FYW_MINIS[0]!, FYW_MINIS[1]!, FYW_MINIS[2]!, "98-008"],
            summaryByCourseCode,
            FYW_MINIS,
        );

        expect(fywMinisAveraged).toBe(false);
        expect(totalWorkload).toBeCloseTo(20, 5);
    });

    test("averages multiple courses without FYW minis", () => {
        const summaryByCourseCode = new Map<string, FCERecordSummary>([
            ["15-112", make(baseSummary, { workload: 9 })],
            ["15-122", make(baseSummary, { workload: 11 })],
            ["15-150", make(baseSummary, { workload: 8 })],
            ["98-008", make(baseSummary, { workload: 6 })],
        ]);

        const { totalWorkload, fywMinisAveraged } = calculateTotalWorkload(
            ["15-112", "15-122", "15-150", "98-008"],
            summaryByCourseCode,
            FYW_MINIS,
        );

        expect(fywMinisAveraged).toBe(false);
        expect(totalWorkload).toBeCloseTo(34, 5);
    });
});

describe("calculateTotalUnits", () => {
    test("returns VAR when all courses are VAR", () => {
        expect(calculateTotalUnits(["VAR", "VAR"])).toBe("VAR");
    });

    test("returns VAR when single course is VAR", () => {
        expect(calculateTotalUnits(["VAR"])).toBe("VAR");
    });

    test("appends plus when mixed VAR and numeric", () => {
        expect(calculateTotalUnits(["VAR", "3"])).toBe("3+");
    });

    test("sums whole units without plus", () => {
        expect(calculateTotalUnits(["3", "1", "2"])).toBe("6");
    });

    test("sums fractional units without plus", () => {
        expect(calculateTotalUnits(["3", "1.5", "2"])).toBe("6.5");
    });
});
