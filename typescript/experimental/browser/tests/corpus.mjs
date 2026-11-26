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

for (const [name, value] of [
    ["high surrogate and BOM", "\ud800\uFEFFx"],
    ["low surrogate and BOM", "\udfff\uFEFFy"],
    ["high surrogate", "\ud800x"],
    ["low surrogate", "\udc00x"],
    ["leading BOM", "\uFEFFx"],
    ["BOM only", "\uFEFF"],
    ["middle BOM", "x\uFEFFy"],
    ["astral Unicode and BOM", "\ud83d\ude00\uFEFFz"],
    ["repeated BOMs and surrogates", "\ud800\uFEFF\uFEFF\udfff\uFEFFx"],
    ["BOM between surrogate halves", "\ud83d\uFEFF\ude00"]
]) {
    const literal = JSON.stringify(value).replace(/[\u007f-\uffff]/g,
        character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
    corpus.push({
        name: `exact Unicode: ${name}`,
        schema: `export enum E { Value = ${literal} } export interface Probe { value: E; }`,
        accepted: [{ value }],
        rejected: [{ value: value.includes("\uFEFF") ? value.replaceAll("\uFEFF", "") : value + "!" }]
    });
}

corpus.push(
    {
        name: "scoped folded Unicode enum members",
        schema: String.raw`
type __TypeChatEnumValues0 = "reserved";
namespace Hidden {
    export enum E { "quoted-key" = "\ud800" + "\uFEFFx" }
    export enum E { ["computed"] = "\udfff\uFEFFy" }
    export namespace E { export const unrelated = { notAnEnumMember: true }; }
}
export interface Probe {
    value: Hidden.E;
    member: (typeof Hidden.E)["quoted-key"];
    values: Hidden.E[];
}`,
        accepted: [{ value: "\udfff\uFEFFy", member: "\ud800\uFEFFx", values: ["\ud800\uFEFFx", "\udfff\uFEFFy"] }],
        rejected: [
            { value: "\udfffy", member: "\ud800\uFEFFx", values: [] },
            { value: "\udfff\uFEFFy", member: "\ud800x", values: [] },
            { value: "\udfff\uFEFFy", member: "\ud800\uFEFFx", values: ["\udfffy"] }
        ]
    },
    {
        name: "contextual enum value name",
        schema: String.raw`export enum keyof { Value = "\ud800\uFEFFx" }
export interface Probe { value: (typeof keyof)["Value"]; }`,
        accepted: [{ value: "\ud800\uFEFFx" }],
        rejected: [{ value: "\ud800x" }]
    },
    {
        name: "function-scoped Unicode enum",
        schema: String.raw`function makeProbe() {
    enum Local { Value = "\ud800\uFEFFx" }
    return { value: Local.Value };
}
export type Probe = ReturnType<typeof makeProbe>;`,
        accepted: [{ value: "\ud800\uFEFFx" }],
        rejected: [{ value: "\ud800x" }]
    }
);

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
        for (const layout of [undefined, "legacy"]) {
            const prompts = [];
            const history = [
                { role: "user", content: "earlier question" },
                { role: "assistant", content: "earlier reply" }
            ];
            const request = "CURRENT_REQUEST_541";
            const translator = createJsonTranslator({
                async complete(prompt) {
                    prompts.push(structuredClone(prompt));
                    return success(prompts.length === 1 ? '{"value":"wrong"}' : '{"value":1}');
                }
            }, validator, layout ? { promptLayout: layout } : undefined);
            const result = await translator.translate(request, history);
            check(result.success && prompts.length === 2, "Prompt-layout repair did not complete.");
            const first = prompts[0];
            const roles = first.map(section => section.role);
            const expectedRoles = layout ? ["user", "assistant", "user"] : ["system", "user", "assistant", "user"];
            check(JSON.stringify(roles) === JSON.stringify(expectedRoles), "Prompt roles or history order changed.");
            check(first.flatMap(section => section.content.split(request)).length - first.length === 1,
                "The current request must appear exactly once.");
            if (!layout) {
                check(first[0].content.includes(corpus[0].schema), "The system message omitted the schema.");
                check(first.at(-1).content === request, "The schema-first request must be verbatim.");
                check(prompts[1][0].content === first[0].content, "Repair text changed system instructions.");
            }
            check(prompts[1].at(-2).role === "assistant" && prompts[1].at(-2).content === '{"value":"wrong"}',
                "The rejected response must remain assistant content.");
            check(prompts[1].at(-1).role === "user", "Repair diagnostics must remain user content.");
            check(JSON.stringify(history) === JSON.stringify([
                { role: "user", content: "earlier question" },
                { role: "assistant", content: "earlier reply" }
            ]), "Translation mutated caller history.");
            observations.push({ name: `prompt layout: ${layout ?? "default schema-first"}`, success: true, message: "" });
        }
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
