import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { strikethrough } from "discord.js";
import { formatCourseNumber } from "./index.ts";

export type FCEData = {
    courseNum: string;
    courseName: string;
    records: FCERecord[];
};

export type FCERecord = {
    section: string;
    instructor: string;
    hrsPerWeek: number;
    overallTeachingRate: number;
    overallCourseRate: number;
    responseRate: number;
    semesterLabel: string;
};

export type FCERecordSummary = {
    teachingRate: number;
    courseRate: number;
    workload: number;
    responseRate: number;
    semesterLabels: string[];
};

export type FCEStartupCache = {
    // course code -> aggregated summary for that course
    summaryByCourseCode: Map<string, FCERecordSummary>;
    // course code -> (instructor name -> aggregated summary for that instructor in that course)
    summaryByInstructorByCourseCode: Map<string, Map<string, FCERecordSummary>>;
};

function abbrevSemester(semester: string): string {
    const normalized = semester.trim().toLowerCase();
    if (normalized === "fall") {
        return "F";
    }
    if (normalized === "spring") {
        return "S";
    }
    if (normalized === "summer") {
        return "M";
    }
    return "?";
}

function formatSemesterLabel(semester: string, year: number): string {
    const tag = abbrevSemester(semester);
    return `${tag}${String(year).slice(-2)}`;
}

function summarizeFCERecords(records: FCERecord[]): FCERecordSummary {
    const uniqueSemesters = [
        ...new Set(records.map((record) => record.semesterLabel)),
    ];
    const nonSummerRecords = records.filter(
        (record) => !record.semesterLabel.startsWith("M"),
    );

    // exclude summer semesters when fall/spring data exists
    const shouldStrikeSummerTerms = nonSummerRecords.length > 0;
    const includedRecords = shouldStrikeSummerTerms
        ? nonSummerRecords
        : records;
    const semesterLabels = uniqueSemesters.map((label) =>
        shouldStrikeSummerTerms && label.startsWith("M")
            ? strikethrough(label)
            : label,
    );

    const n = includedRecords.length;
    if (n === 0) {
        return {
            teachingRate: 0,
            courseRate: 0,
            workload: 0,
            responseRate: 0,
            semesterLabels,
        };
    }

    return {
        teachingRate:
            includedRecords.reduce(
                (sum, record) => sum + record.overallTeachingRate,
                0,
            ) / n,
        courseRate:
            includedRecords.reduce(
                (sum, record) => sum + record.overallCourseRate,
                0,
            ) / n,
        workload:
            includedRecords.reduce(
                (sum, record) => sum + record.hrsPerWeek,
                0,
            ) / n,
        responseRate:
            includedRecords.reduce(
                (sum, record) => sum + record.responseRate,
                0,
            ) / n,
        semesterLabels,
    };
}

function buildFCEStartupCache(
    fceDataByCourse: Record<string, FCEData>,
): FCEStartupCache {
    const summaryByCourseCode = new Map<string, FCERecordSummary>();
    // Two-level index to support O(1) summary lookup by course and instructor at runtime.
    const summaryByInstructorByCourseCode = new Map<
        string,
        Map<string, FCERecordSummary>
    >();

    for (const [courseCode, fceData] of Object.entries(fceDataByCourse)) {
        summaryByCourseCode.set(
            courseCode,
            summarizeFCERecords(fceData.records),
        );

        const recordsByInstructor = new Map<string, FCERecord[]>();
        for (const record of fceData.records) {
            const instructorRecords =
                recordsByInstructor.get(record.instructor) ?? [];
            instructorRecords.push(record);
            recordsByInstructor.set(record.instructor, instructorRecords);
        }

        const instructorSummaries = new Map<string, FCERecordSummary>();
        for (const [instructor, instructorRecords] of recordsByInstructor) {
            instructorSummaries.set(
                instructor,
                summarizeFCERecords(instructorRecords),
            );
        }
        summaryByInstructorByCourseCode.set(courseCode, instructorSummaries);
    }

    return {
        summaryByCourseCode,
        summaryByInstructorByCourseCode,
    };
}

function loadFCEData(): Record<string, FCEData> {
    const fceMap: Record<string, FCEData> = {};
    const csvPath = join(__dirname, "../data/fce_data.csv");
    const csvContent = readFileSync(csvPath, "utf-8");

    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
    }) as Array<Record<string, string>>;

    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 5;

    type PendingFCERecord = {
        section: string;
        instructor: string;
        semesterLabel: string;
        hrsPerWeekSum: number;
        overallTeachingRateSum: number;
        overallCourseRateSum: number;
        responseRateSum: number;
        count: number;
    };

    // course code -> ("instructor-semester" -> running FCE sums)
    const pendingByCourse: Record<string, Map<string, PendingFCERecord>> = {};

    for (const record of records) {
        const dept = record["Dept"];
        const num = record["Num"];
        const semester = record["Sem"];
        const year = parseInt(record["Year"] ?? "0");
        if (!dept || !num) continue;

        // only consider FCEs from the past 5 years
        if (year < cutoffYear) continue;

        const formattedCode = formatCourseNumber(num);
        if (!formattedCode || !semester) continue;

        const semesterLabel = formatSemesterLabel(semester, year);

        const hrsPerWeek = parseFloat(record["Hrs Per Week"] ?? "");
        const overallTeachingRate = parseFloat(
            record["Overall teaching rate"] ?? "",
        );
        const overallCourseRate = parseFloat(
            record["Overall course rate"] ?? "",
        );
        const responseRate = parseFloat(record["Response Rate"] ?? "");

        if (
            Number.isNaN(hrsPerWeek) ||
            Number.isNaN(overallTeachingRate) ||
            Number.isNaN(overallCourseRate) ||
            Number.isNaN(responseRate)
        ) {
            continue;
        }

        if (!fceMap[formattedCode]) {
            const courseName = record["Course Name"] ?? "";
            fceMap[formattedCode] = {
                courseNum: formattedCode,
                courseName,
                records: [],
            };
        }

        const instructor = record["Instructor"] ?? "";
        const section = record["Section"] ?? "";

        if (!pendingByCourse[formattedCode]) {
            pendingByCourse[formattedCode] = new Map<
                string,
                PendingFCERecord
            >();
        }

        const dedupeKey = `${instructor}-${semesterLabel}`;
        const pendingRecord = pendingByCourse[formattedCode].get(dedupeKey);
        if (!pendingRecord) {
            pendingByCourse[formattedCode].set(dedupeKey, {
                section,
                instructor,
                semesterLabel,
                hrsPerWeekSum: hrsPerWeek,
                overallTeachingRateSum: overallTeachingRate,
                overallCourseRateSum: overallCourseRate,
                responseRateSum: responseRate,
                count: 1,
            });
        } else {
            pendingRecord.hrsPerWeekSum += hrsPerWeek;
            pendingRecord.overallTeachingRateSum += overallTeachingRate;
            pendingRecord.overallCourseRateSum += overallCourseRate;
            pendingRecord.responseRateSum += responseRate;
            pendingRecord.count++;
        }
    }

    // merge FCE data with the same instructor in the same semester
    for (const courseCode in pendingByCourse) {
        const data = fceMap[courseCode];
        if (!data) continue;

        const pendingCourseRecords = pendingByCourse[courseCode];
        if (!pendingCourseRecords) continue;

        data.records = [...pendingCourseRecords.values()].map(
            (pendingRecord): FCERecord => ({
                section: pendingRecord.section,
                instructor: pendingRecord.instructor,
                semesterLabel: pendingRecord.semesterLabel,
                hrsPerWeek: pendingRecord.hrsPerWeekSum / pendingRecord.count,
                overallTeachingRate:
                    pendingRecord.overallTeachingRateSum / pendingRecord.count,
                overallCourseRate:
                    pendingRecord.overallCourseRateSum / pendingRecord.count,
                responseRate:
                    pendingRecord.responseRateSum / pendingRecord.count,
            }),
        );
    }

    return fceMap;
}

export const FCE_DATA_BY_COURSE = loadFCEData();
export const FCE_STARTUP_CACHE = buildFCEStartupCache(FCE_DATA_BY_COURSE);
