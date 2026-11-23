import {
    bold,
    EmbedBuilder,
    hyperlink,
    MessageFlags,
    SlashCommandBuilder,
    underline,
} from "discord.js";
import { SCOTTYLABS_URL } from "../constants.ts";
import type { SlashCommand } from "../types.d.ts";
import { EmbedPaginator } from "../utils/EmbedPaginator.ts";
import { Course, COURSES_DATA, formatCourseNumber } from "../utils/index.ts";
import {
    BasicOperatorExecutionContext,
    parseAndEvaluate,
} from "../utils/parser/basicOperatorParser.ts";
import { InvalidTokenError, ParserError } from "../utils/parser/errors.ts";

function fetchCourseUnlocks(courseData: Record<string, Course>, courseNumber: string): Course[] {
    const unlocks: Course[] = [];

    for (const course of Object.values(courseData)) {
        if (course.prereqs.includes(courseNumber)) {
            unlocks.push(course);
        }
    }

    return unlocks;
}
export function evaluatePrereq(preReqString: string, courses: string[]): boolean {
    preReqString = preReqString.replaceAll("or", "||").replaceAll("and", "&&");
    for (const course of courses) {
        preReqString = preReqString.replaceAll(course, "true");
    }
    preReqString = preReqString.replaceAll(/\b\d{2}(-| )?\d{3}\b/g, "false");
    try {
        // preReqString is guaranteed safe
        // oxlint-disable-next-line no-eval
        return eval(preReqString);
    } catch {
        return false;
    }
}
export function fetchOtherCoursePrereqsNum(course: Course, prereq: Course): number {
    if (!course.prereqs.includes(prereq.id)) {
        return -1;
    }

    const nodes: string[][] = [];
    nodes.push([prereq.id]);
    for (const courseNumber of course.prereqs) {
        if (courseNumber !== prereq.id) {
            nodes.push([prereq.id, courseNumber]);
        }
    }
    while (nodes.length > 0 && nodes[0]) {
        console.log(`first node: ${nodes[0].join(" ")}, length ${nodes.length}`);
        if (!evaluatePrereq(course.prereqString, nodes[0])) {
            if (nodes.length < course.prereqs.length) {
                for (const courseNumber of course.prereqs.filter((c) => !nodes[0]!.includes(c))) {
                    nodes.push([...nodes[0], courseNumber]);
                }
            }
        } else {
            console.log(`finished! ${nodes[0].join(" ")}`);
            return nodes[0].length - 1;
        }
        nodes.shift();
    }
    return 0;
}

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("unlocks")
        .setDescription("Shows all the courses a course unlocks")
        .addStringOption((option) =>
            option
                .setName("courses_string")
                .setDescription(
                    "The course code (e.g., 15-112 or 21127), optionally combined with AND/OR operators",
                )
                .setRequired(true),
        ),
    async execute(interaction) {
        const coursesData = COURSES_DATA;

        function lookup(value: string): Course[] {
            const courseCode = formatCourseNumber(value);

            if (!courseCode) {
                throw new Error(`Invalid course code: ${value}`);
            }

            if (!coursesData[courseCode]) {
                throw new Error(`Course not found: ${courseCode}`);
            }

            return fetchCourseUnlocks(coursesData, courseCode).map(
                (course) =>
                    ({
                        id: course.id,
                        name: course.name,
                    }) as Course,
            );
        }

        function equals(a: Course, b: Course): boolean {
            return a.id === b.id;
        }

        function universe(): Course[] {
            return Object.values(coursesData).map(
                (course) =>
                    ({
                        id: course.id,
                        name: course.name,
                    }) as Course,
            );
        }

        const courseString = interaction.options.getString("courses_string", true);

        let unlockCourses: Course[];
        try {
            unlockCourses = parseAndEvaluate<string, Course>(
                courseString,
                new BasicOperatorExecutionContext<string, Course>(
                    (value) => {
                        if (!value.match(/^\d{2}(-| )?\d{3}$/)) {
                            throw new InvalidTokenError(value);
                        }
                        return value;
                    },
                    lookup,
                    equals,
                    universe,
                ),
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            const locationInfo =
                error instanceof ParserError && error.sourceLocation.index >= 0
                    ? ` at index ${error.sourceLocation.index}`
                    : "";
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Error parsing course string")
                        .setDescription(`\`\`\`\n${errorMessage}\n${locationInfo}\n\`\`\``),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        unlockCourses.sort((a, b) => a.id.localeCompare(b.id));

        if (unlockCourses.length === 0) {
            return interaction.reply({
                content: `No courses found that have the prerequisite ${courseString}.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const embeds = [];
        let chunk = [];
        const singleCourse = formatCourseNumber(courseString.trim());
        let showAddtlPrereq = false;
        while (unlockCourses.length > 0) {
            chunk.push(unlockCourses.shift());
            if (chunk.length >= 20 || unlockCourses.length === 0) {
                const description = chunk
                    .map((course) => {
                        const link = hyperlink(
                            `${bold(course!.id)}: ${course!.name}`,
                            `${SCOTTYLABS_URL}/course/${course!.id}`,
                        );

                        const prereqCount = singleCourse
                            ? fetchOtherCoursePrereqsNum(
                                  coursesData[course!.id]!,
                                  coursesData[singleCourse]!,
                              )
                            : undefined;
                        if (prereqCount) {
                            showAddtlPrereq = true;
                        }
                        return prereqCount ? `${link} (${prereqCount})` : link;
                    })
                    .join("\n");
                const embed = new EmbedBuilder()
                    .setTitle(`Courses with the prerequisite ${underline(courseString)}`)
                    .setDescription(
                        `${
                            showAddtlPrereq
                                ? "Number of additional courses needed to unlock course shown in ( ) \n\n"
                                : ""
                        }${description}`,
                    );
                embeds.push(embed);
                chunk = [];
            }
        }

        const paginator = new EmbedPaginator({ pages: embeds });
        await paginator.send(interaction);
    },
};

export default command;
