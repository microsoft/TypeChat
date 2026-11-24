export const corpus = [
    {
        name: "ordinary JSON",
        schema: "export interface Probe { value: number; label?: string; }",
        accepted: [{ value: 1 }, { value: 0, label: "zero" }],
        rejected: [{}, { value: "1" }, { value: 1, extra: true }, { value: null }]
    },
    {
        name: "string enum",
        schema: 'export enum Currency { Euro = "EUR", Dollar = "USD" } export interface Probe { value: Currency; }',
        accepted: [{ value: "EUR" }, { value: "USD" }],
        rejected: [{ value: "Euro" }, { value: "unknown" }, { value: 1 }]
    },
    {
        name: "enum member",
        schema: 'export enum Currency { Euro = "EUR", Dollar = "USD" } export interface Probe { value: Currency.Euro; }',
        accepted: [{ value: "EUR" }],
        rejected: [{ value: "USD" }]
    },
    {
        name: "constant-folded string enum",
        schema: 'export enum Name { A = "A", AB = A + "B" } export interface Probe { value: Name; }',
        accepted: [{ value: "AB" }],
        rejected: [{ value: "B" }]
    },
    {
        name: "numeric enums",
        schema: "export enum Level { Low, High } export interface Probe { value: Level; }",
        accepted: [{ value: 0 }, { value: 1 }],
        rejected: [{ value: 3 }, { value: "Low" }]
    },
    {
        name: "nested collections and unions",
        schema: `
export enum Status { Active = "active", Paused = "paused" }
export interface Item { status: Status }
export interface Probe {
    items: Item[];
    lookup: Record<string, Status>;
    result: { ok: true; value: Status } | { ok: false; message: string };
}`,
        accepted: [{ items: [{ status: "active" }], lookup: { a: "paused" }, result: { ok: true, value: "active" } }],
        rejected: [
            { items: [{ status: "bad" }], lookup: {}, result: { ok: false, message: "x" } },
            { items: [], lookup: { a: "bad" }, result: { ok: false, message: "x" } },
            { items: [], lookup: {}, result: { ok: true, value: "bad" } }
        ]
    },
    {
        name: "recursive tuples and optional enums",
        schema: 'export enum E { A = "a" } export interface Probe { pair: [E, number]; next?: Probe; optional?: E; }',
        accepted: [{ pair: ["a", 1], next: { pair: ["a", 2] } }],
        rejected: [{ pair: ["a"] }, { pair: ["a", "1"] }, { pair: ["a", 1], optional: "bad" }]
    },
    {
        name: "branded strings remain constrained",
        schema: 'export enum E { A = "a" } type Brand = string & { readonly brand: unique symbol }; export interface Probe { value: Brand; enumValue: E; }',
        accepted: [],
        rejected: [{ value: "a", enumValue: "a" }]
    },
    {
        name: "call signatures remain constrained",
        schema: 'export enum E { A = "a" } export interface Probe { value: () => E; }',
        accepted: [],
        rejected: [{ value: {} }]
    },
    {
        name: "construct signatures remain constrained",
        schema: 'export enum E { A = "a" } export interface Probe { value: new () => { e: E }; }',
        accepted: [],
        rejected: [{ value: {} }]
    },
    {
        name: "private class members remain constrained",
        schema: 'export enum E { A = "a" } export class C { private value!: E; } export interface Probe { item: C; }',
        accepted: [],
        rejected: [{ item: {} }, { item: { value: "a" } }]
    },
    {
        name: "Promise-like values remain constrained",
        schema: 'export enum E { A = "a" } export interface Probe { value: PromiseLike<E>; }',
        accepted: [],
        rejected: [{ value: { then: {} } }]
    },
    {
        name: "weak object types",
        schema: 'export enum E { A = "a" } export interface Probe { value: { e?: E }; }',
        accepted: [{ value: {} }, { value: { e: "a" } }],
        rejected: [{ value: 1 }, { value: { extra: true } }]
    },
    {
        name: "explicit object intersections",
        schema: 'export enum E { A = "a" } export interface Probe { value: { e?: E } & object; }',
        accepted: [{ value: {} }, { value: [] }],
        rejected: [{ value: 1 }, { value: "a" }]
    },
    {
        name: "full missing-property diagnostics",
        schema: 'export enum E { A = "a" } export interface Probe { a: E; b: string; c: string; d: string; e: string; f: string; g: string; h: string; }',
        accepted: [{ a: "a", b: "", c: "", d: "", e: "", f: "", g: "", h: "" }],
        rejected: [{}],
        diagnostic: /b, c, d, e, f, g, h/,
        noDiagnostic: /and \d+ more|__TypeChatJsonWire/
    }
];

export const invalidSchemas = [
    { name: "missing target", schema: "export interface Other { value: number; }" },
    { name: "missing export", schema: "interface Probe { value: number; } export {};" },
    { name: "unknown type", schema: "export interface Probe { value: MissingType; }" },
    { name: "unsupported runtime type", schema: "export interface Probe { value: Date; }" },
    { name: "syntax error", schema: "export interface Probe { value: ; }" }
];

function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

export async function runCorpus(createValidator, { createJsonTranslator, success, typeChatSchemaValidation }) {
    const observations = [];
    for (const group of corpus) {
        const validator = await createValidator(group.schema, "Probe");
        try {
            const preflight = validator[typeChatSchemaValidation]();
            check(preflight.success, `${group.name}: schema rejected: ${preflight.message}`);
            check(validator.getSchemaText() === group.schema, "Prompt schema was changed.");
            for (const [expected, values] of [[true, group.accepted], [false, group.rejected]]) {
                for (const value of values) {
                    const result = validator.validate(value);
                    check(result.success === expected, `${group.name}: incorrect result for ${JSON.stringify(value)}: ${result.message}`);
                    if (result.success) {
                        check(result.data === value, `${group.name}: validation replaced the JSON object.`);
                    } else {
                        check(result.data === value, `${group.name}: rejected candidate was not retained.`);
                        check(result.message.length > 0, `${group.name}: missing diagnostic.`);
                        check(!group.diagnostic || group.diagnostic.test(result.message), `${group.name}: incomplete diagnostic: ${result.message}`);
                        check(!group.noDiagnostic || !group.noDiagnostic.test(result.message), `${group.name}: leaked/truncated diagnostic.`);
                    }
                    observations.push({ name: group.name, success: result.success, message: result.message ?? "" });
                }
            }
        } finally {
            validator.close();
        }
    }
    for (const invalid of invalidSchemas) {
        for (const attemptRepair of [false, true]) {
            const validator = await createValidator(invalid.schema, "Probe");
            let calls = 0;
            try {
                const translator = createJsonTranslator({
                    async complete() {
                        calls++;
                        throw new Error("An invalid schema must not call the model.");
                    }
                }, validator);
                translator.attemptRepair = attemptRepair;
                const result = await translator.translate("Return a value.");
                check(!result.success && calls === 0, `${invalid.name}: invalid schema reached the model.`);
                check(result.message.includes("Schema validation failed"), `${invalid.name}: missing schema diagnostic.`);
                observations.push({ name: `${invalid.name}/${attemptRepair}`, success: false, message: result.message });
            } finally {
                validator.close();
            }
        }
    }
    const translationCases = [
        { name: "valid translation", responses: ['{"value":1}'], repair: false, success: true },
        { name: "repair disabled", responses: ['{"value":"wrong"}'], repair: false, success: false },
        { name: "malformed JSON", responses: ['{"value":'], repair: false, success: false },
        { name: "successful repair", responses: ['{"value":"wrong"}', '{"value":1}'], repair: true, success: true },
        { name: "exhausted repair", responses: ['{"value":"wrong"}', '{"value":"still wrong"}'], repair: true, success: false }
    ];
    const validator = await createValidator(corpus[0].schema, "Probe");
    try {
        for (const example of translationCases) {
            let calls = 0;
            const translator = createJsonTranslator({
                async complete() {
                    check(calls < example.responses.length, "Unexpected repair call.");
                    return success(example.responses[calls++]);
                }
            }, validator);
            translator.attemptRepair = example.repair;
            const result = await translator.translate("Return one.");
            check(result.success === example.success, `${example.name}: incorrect result.`);
            check(calls === example.responses.length, `${example.name}: incorrect model call count.`);
            if (!result.success) {
                check(result.responseText === example.responses.at(-1), `${example.name}: response text was lost.`);
            }
            observations.push({ name: example.name, success: result.success, message: result.message ?? "" });
        }
        check(validator[typeChatSchemaValidation]().success, "A rejected instance poisoned schema preflight.");
    } finally {
        validator.close();
    }
    validator.close();
    for (const operation of [
        () => validator.validate({ value: 1 }),
        () => validator[typeChatSchemaValidation]()
    ]) {
        let closedError;
        try {
            operation();
        } catch (error) {
            closedError = error;
        }
        check(closedError?.message.includes("closed"), "Use after close did not fail explicitly.");
    }
    return observations;
}
