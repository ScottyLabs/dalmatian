import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { type ChatInputCommandInteraction, ContainerBuilder } from "discord.js";
import { SCHOOLS } from "../src/constants.ts";
import { buildAdvancedCreditResult } from "../src/commands/credits.ts";
import {
    type AdvancedCreditType,
    loadCreditData,
    type School,
    SCORE_RANGES,
} from "../src/utils/advancedCreditCourseUtils.ts";
import {
    assertDiscordSafeComponents,
    buildResultContainer,
    DISCORD_COMPONENT_LIMITS,
    getResultPageCount,
    type SetupField,
    SetupForm,
    type SetupResult,
    type SetupSchema,
} from "../src/utils/creditCalculatorForm.ts";

type ComponentJson = {
    type?: number;
    custom_id?: string;
    label?: string;
    components?: ComponentJson[];
    options?: { label?: string; value?: string }[];
};

type InspectableSetupForm = {
    buildFormContainer(scoreRequest?: { fieldKey: string; examIndex: number }): ContainerBuilder;
    handleScoreSelect(interaction: {
        customId: string;
        values: string[];
        update(options: unknown): Promise<void>;
        reply(options: unknown): Promise<void>;
    }): Promise<void>;
    safeUpdate(
        interaction: {
            update(options: unknown): Promise<void>;
            reply(options: unknown): Promise<void>;
        },
        components: ContainerBuilder[],
    ): Promise<void>;
    state: {
        collectedData: Record<string, unknown>;
    };
};

function walkComponents(
    component: ComponentJson,
    visitor: (component: ComponentJson) => void,
): void {
    visitor(component);
    for (const child of component.components ?? []) {
        walkComponents(child, visitor);
    }
}

function allComponents(container: ContainerBuilder): ComponentJson[] {
    const components: ComponentJson[] = [];
    walkComponents(container.toJSON() as ComponentJson, (component) => components.push(component));
    return components;
}

async function buildSchema(type: AdvancedCreditType, school: School): Promise<SetupSchema> {
    const exams = await loadCreditData(type);

    const stemExams = exams.filter((e) => e.subject === "STEM");
    const artsExams = exams.filter((e) => e.subject === "Arts");
    const humanitiesExams = exams.filter((e) => e.subject === "Humanities");

    const stemExamsUnique = Array.from(new Map(stemExams.map((e) => [e.name, e])).values());
    const artsExamsUnique = Array.from(new Map(artsExams.map((e) => [e.name, e])).values());
    const humanitiesExamsUnique = Array.from(
        new Map(humanitiesExams.map((e) => [e.name, e])).values(),
    );
    const artsSciencesUnique = Array.from(
        new Map([...artsExamsUnique, ...stemExamsUnique].map((e) => [e.name, e])).values(),
    );

    const fields: SetupField[] = [
        {
            key: "stem-arts",
            label: `Arts and Sciences ${type} Exams`,
            required: false,
            multiple: false,
            type: "string",
            options: artsSciencesUnique.map((e) => ({
                label: e.name,
                value: e.name,
            })),
            modal: {
                title: `Enter ${type} Score`,
                input: {
                    key: "score",
                    ...SCORE_RANGES[type],
                },
            },
        },
        {
            key: "humanities",
            label: `Humanities ${type} Exams`,
            required: false,
            multiple: false,
            type: "string",
            options: humanitiesExamsUnique.map((e) => ({
                label: e.name,
                value: e.name,
            })),
            modal: {
                title: `Enter ${type} Score`,
                input: {
                    key: "score",
                    ...SCORE_RANGES[type],
                },
            },
        },
    ];

    return {
        name: `${type} Credit Calculator`,
        type,
        fields,
        onComplete: (data) => buildAdvancedCreditResult(data, exams, type, school),
    };
}

function selectedDataForAllOptions(schema: SetupSchema): Record<string, unknown> {
    const score = schema.type === "Cambridge" ? "A*" : schema.type === "IB" ? 7 : 5;
    return Object.fromEntries(
        schema.fields.map((field) => [
            field.key,
            (field.options ?? []).map((option) => ({
                examName: option.value,
                score,
            })),
        ]),
    );
}

function inspectableForm(schema: SetupSchema): InspectableSetupForm {
    return new SetupForm(
        schema,
        {} as ChatInputCommandInteraction,
    ) as unknown as InspectableSetupForm;
}

describe("credit calculator component rendering", () => {
    test("summarizes excessive selected exams without exceeding container limits", async () => {
        const schema = await buildSchema("AP", "CIT");
        const form = inspectableForm(schema);
        form.state.collectedData = selectedDataForAllOptions(schema);

        const container = form.buildFormContainer();

        assertDiscordSafeComponents([container]);
        expect((container.toJSON() as ComponentJson).components!.length).toBeLessThanOrEqual(
            DISCORD_COMPONENT_LIMITS.containerChildren,
        );
    });

    test("keeps long exam score-select custom IDs within Discord's 100-character limit", async () => {
        const schema = await buildSchema("IB", "CIT");
        const field = schema.fields.find((f) => f.key === "stem-arts")!;
        const examIndex = field.options!.findIndex((option) =>
            option.value.includes("Information Technology in a Global Society"),
        );
        const form = inspectableForm(schema);

        const container = form.buildFormContainer({
            fieldKey: field.key,
            examIndex,
        });
        const customIds = allComponents(container)
            .map((component) => component.custom_id)
            .filter((customId): customId is string => Boolean(customId));

        expect(examIndex).toBeGreaterThanOrEqual(0);
        expect(Math.max(...customIds.map((customId) => customId.length))).toBeLessThanOrEqual(
            DISCORD_COMPONENT_LIMITS.customIdLength,
        );
        assertDiscordSafeComponents([container]);
    });

    test("paginates oversized select option lists to 25 options per menu", () => {
        const schema: SetupSchema = {
            name: "AP Credit Calculator",
            type: "AP",
            fields: [
                {
                    key: "many",
                    label: "Many Exams",
                    required: false,
                    multiple: false,
                    type: "string",
                    options: Array.from({ length: 30 }, (_, index) => ({
                        label: `Exam ${index + 1}`,
                        value: `Exam ${index + 1}`,
                    })),
                    modal: {
                        title: "Enter AP Score",
                        input: { key: "score", ...SCORE_RANGES.AP },
                    },
                },
            ],
            onComplete: (): SetupResult => ({
                title: "Awarded CMU Credit",
                emptyMessage: "No credit awarded based on the selected exams.",
                items: [],
            }),
        };
        const form = inspectableForm(schema);

        const container = form.buildFormContainer();
        const selectOptions = allComponents(container)
            .filter((component) => component.type === 3)
            .flatMap((component) => component.options ?? []);

        expect(selectOptions.length).toBe(DISCORD_COMPONENT_LIMITS.stringSelectOptions);
        assertDiscordSafeComponents([container]);
    });

    test("renders every current all-exam result set into safe pages", async () => {
        for (const type of ["AP", "IB", "Cambridge"] as const) {
            for (const school of SCHOOLS as School[]) {
                const schema = await buildSchema(type, school);
                const result = await schema.onComplete(selectedDataForAllOptions(schema));
                const pageCount = getResultPageCount(result);

                for (let page = 0; page < pageCount; page++) {
                    const container = buildResultContainer(result, type, page, true);
                    assertDiscordSafeComponents([container]);
                    expect(
                        (container.toJSON() as ComponentJson).components!.length,
                    ).toBeLessThanOrEqual(DISCORD_COMPONENT_LIMITS.containerChildren);
                }
            }
        }
    });

    test("uses embed paginator-style controls for paged credit results", () => {
        const result: SetupResult = {
            title: "Awarded CMU Credit",
            emptyMessage: "No credit awarded based on the selected exams.",
            items: Array.from({ length: 6 }, (_, index) => `Course ${index + 1}`),
        };

        const container = buildResultContainer(result, "AP", 0, true);
        const buttonLabels = allComponents(container)
            .filter((component) => component.type === 2)
            .map((component) => component.label);

        expect(buttonLabels).toEqual(["<<", "<", "1/2", ">", ">>"]);
        assertDiscordSafeComponents([container]);
    });

    test("emits the unavailable gened notice once for TEP results", async () => {
        const schema = await buildSchema("AP", "TEP");

        const result = await schema.onComplete(selectedDataForAllOptions(schema));

        expect(result.notices).toEqual(["Gened data not available for TEP"]);
    });

    test("updates an existing selected exam score instead of duplicating it", async () => {
        const schema = await buildSchema("AP", "CIT");
        const form = inspectableForm(schema);
        const fakeInteraction = {
            customId: "credit;AP;score;stem-arts;0;1",
            values: ["5"],
            update: async (_options: unknown) => {},
            reply: async (_options: unknown) => {},
        };

        await form.handleScoreSelect(fakeInteraction);
        fakeInteraction.values = ["4"];
        await form.handleScoreSelect(fakeInteraction);

        const selected = form.state.collectedData["stem-arts"] as {
            score: number;
        }[];
        expect(selected.length).toBe(1);
        expect(selected[0]!.score).toBe(4);
    });

    test("safeUpdate catches rejected message updates and sends a fallback reply", async () => {
        const schema = await buildSchema("AP", "CIT");
        const form = inspectableForm(schema);
        let replied = false;
        const fakeInteraction = {
            update: (_options: unknown) => Promise.reject(new Error("mock update failure")),
            reply: (_options: unknown) => {
                replied = true;
                return Promise.resolve();
            },
        };

        await form.safeUpdate(fakeInteraction, [
            new ContainerBuilder().addTextDisplayComponents((text) => text.setContent("Fallback")),
        ]);

        expect(replied).toBe(true);
    });
});
