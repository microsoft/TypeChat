import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    createJsonTranslator,
    typeChatSchemaValidation,
    type TypeChatJsonValidator
} from "../dist/index.js";
import {
    createTypeScriptJsonValidator,
    type TypeScriptJsonValidator
} from "../dist/ts/index.js";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

// Schema with 8 required properties — enough to trigger TS error 2740
// ("and N more") when several are absent.
const largeSchema = `
export interface Doc {
    id: number;
    title: string;
    slug: string;
    abstract: string;
    description: string;
    author: string;
    date: string;
    category: string;
}`;

// Schema with a mix of required and optional properties.
const mixedSchema = `
export interface Item {
    id: number;
    name: string;
    tag?: string;
    extra1: string;
    extra2: string;
    extra3: string;
    extra4: string;
    extra5: string;
}`;

// Small schema for simpler error cases.
const smallSchema = `
export interface Point {
    x: number;
    y: number;
}`;

// Schemas for serialized string-enum validation.
const stringEnumSchema = `
export enum Currency {
    USD = "USD",
    EUR = "EUR"
}
export interface Order {
    currency: Currency;
}`;

const differingEnumValueSchema = `
export enum Plan {
    Basic = "basic",
    Pro = "pro"
}
export interface Subscription {
    plan: Plan;
}`;

const nestedEnumSchema = `
export enum Status {
    Active = "active",
    Paused = "paused"
}
export interface Item {
    status: Status;
}
export interface Batch {
    primary: Item;
    items: Item[];
    lookup: { [id: string]: Status };
    result: { ok: true; value: Status } | { ok: false; error: string };
}`;

const enumMemberTypeSchema = `
export enum Currency {
    USD = "USD",
    EUR = "EUR"
}
export type EuropeanCurrency = Currency.EUR;
export interface Payment {
    currency: EuropeanCurrency;
}`;

const numericEnumSchema = `
export enum Priority {
    Low,
    Medium,
    High
}
export interface Config {
    priority: Priority;
    count: number;
}`;

const computedStringEnumSchema = `
export enum Currency {
    Euro = "E" + "UR"
}
export interface Order {
    currency: Currency;
}`;

const recursiveEnumSchema = `
export enum Phase {
    Draft = "draft",
    Done = "done"
}
export interface Task {
    phase: Phase;
    next?: Task;
    history: [Phase, number];
}`;

const brandedStringSchema = `
type UserId = string & { readonly __brand: "UserId" };
export interface Response {
    id: UserId;
}`;

const objectConstraintSchema = `
export interface Response {
    value: object & { length: number };
}`;

const diagnosticSchema = `
export enum State {
    Active = "active"
}
export interface Item {
    state: State;
    count: number;
}
export interface Response {
    item: Item;
}`;

const callbackSchema = `
export interface Response {
    callback: () => string;
}`;

const constructableSchema = `
export interface Response {
    factory: new () => { ok: boolean };
}`;

const promiseSchema = `
export interface Response {
    value: Promise<string>;
}`;

const classInstanceSchema = `
export class Token {
    private brand!: string;
    value!: string;
}
export interface Response {
    token: Token;
}`;

// Enum-bearing variants ensure the enum wire mapping does not change unrelated constraints.
const wrapperTypeSchema = `
export enum Mode {
    On = "on",
    Off = "off"
}
export interface Response {
    count: Number;
    enabled: Boolean;
    label: String;
    mode: Mode;
}`;

const objectConstraintEnumSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    value: object & { length: number };
}`;

const weakObjectSchema = `
export interface Response {
    options: { enabled?: boolean };
}`;

const weakObjectEnumSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    options: { enabled?: boolean };
}`;

const plainObjectEnumSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    value: object;
}`;

const escapedJsonWireTypeSchema = `
export enum Mode {
    On = "on"
}
export type \\u005f_TypeChatJsonWire = { mode: Mode };`;

const brandedStringEnumSchema = `
export enum Mode {
    On = "on"
}
type UserId = string & { readonly __brand: "UserId" };
export interface Response {
    mode: Mode;
    id: UserId;
}`;

const callbackEnumSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    callback: () => string;
    factory: new () => { ok: boolean };
}`;

const classInstanceEnumSchema = `
export enum Mode {
    On = "on"
}
export class Token {
    private brand!: string;
    value!: string;
}
export interface Response {
    mode: Mode;
    token: Token;
}`;

const numericAndStringEnumSchema = `
export enum Priority {
    Low,
    High
}
export enum Mode {
    On = "on"
}
export interface Config {
    priority: Priority;
    mode: Mode;
    count: number;
}`;

const wideEnumSchema = `
export enum Mode {
    On = "on",
    Off = "off"
}
export interface Response {
    mode: Mode;
    m1: string; m2: string; m3: string; m4: string;
    m5: string; m6: string; m7: string;
}`;

const quotedValueSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    note: "fixed";
}`;

const helperSpellingEnumSchema = `
export enum Mode {
    Wire = "__TypeChat" + "JsonWireEnum"
}
export interface Response {
    mode: Mode;
}`;

const literalTypeSchema = `
export enum Mode {
    On = "on"
}
export interface Box<T> {
    value: T;
}
export interface Response {
    mode: Mode;
    box: Box<"fixed">;
    item: { kind: "fixed"; count: number };
}`;

const andMoreValueSchema = `
export enum Mode {
    On = "on"
}
export interface Response {
    mode: Mode;
    note: "fixed";
    extra: string;
}`;

const nestedMissingSchema = `
export enum Mode {
    On = "on"
}
export interface LargeItem {
    m1: string; m2: string; m3: string; m4: string;
    m5: string; m6: string; m7: string;
}
export interface Response {
    mode: Mode;
    item: LargeItem;
    extra: string;
}`;

const recursiveMissingSchema = `
export enum Mode {
    On = "on"
}
export interface Node {
    mode: Mode;
    id: string; a: string; b: string; c: string;
    d: string; e: string; f: string;
    next: Node;
}`;

const genericWrapperSchema = `
export interface Metadata {
    m1: string; m2: string; m3: string; m4: string;
    m5: string; m6: string; m7: string;
}
export interface Wrapper<T> {
    a: string; b: string; c: string; d: string;
    e: string; f: string; g: string; payload: T;
}
export type Response = Wrapper<Metadata>;
`;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const openValidators: { close(): void }[] = [];

function validatorFor<T extends object>(schema: string, typeName: string) {
    const validator = createTypeScriptJsonValidator<T>(schema, typeName);
    openValidators.push(validator);
    return validator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTypeScriptJsonValidator", () => {
    afterEach(() => {
        for (const validator of openValidators.splice(0)) {
            validator.close();
        }
    });

    describe("schema-only validation", () => {
        const invalidSchemas = [
            {
                name: "unsupported built-in types",
                schema: "export interface Event { dateTime?: Date; }",
                typeName: "Event",
                diagnostic: /Date/
            },
            {
                name: "unsupported library generics",
                schema: "export interface Event { values: Set<string>; }",
                typeName: "Event",
                diagnostic: /Set/
            },
            {
                name: "syntax errors",
                schema: "export interface Event { dateTime: string;",
                typeName: "Event",
                diagnostic: /schema\.ts\(\d+,\d+\):/
            },
            {
                name: "unresolved references",
                schema: "export interface Event { dateTime: MissingType; }",
                typeName: "Event",
                diagnostic: /MissingType/
            },
            {
                name: "references to the internal probe name",
                schema: "export interface Event { next?: __TypeChatSchemaTarget; }",
                typeName: "Event",
                diagnostic: /__TypeChatSchemaTarget/
            },
            {
                name: "missing target exports",
                schema: "export interface Event { dateTime: string; }",
                typeName: "MissingEvent",
                diagnostic: /MissingEvent/
            }
        ];

        for (const { name, schema, typeName, diagnostic } of invalidSchemas) {
            for (const attemptRepair of [true, false]) {
                it(`rejects ${name} before a model call when repair is ${attemptRepair ? "enabled" : "disabled"}`, async () => {
                    const validator = validatorFor(schema, typeName);
                    let modelCalls = 0;
                    const translator = createJsonTranslator({
                        async complete() {
                            modelCalls++;
                            return { success: true as const, data: "{}" };
                        }
                    }, validator);
                    translator.attemptRepair = attemptRepair;

                    try {
                        const result = await translator.translate("test request");
                        assert.equal(modelCalls, 0);
                        assert.equal(result.success, false);
                        assert.match(result.message, /schema validation failed before model request/i);
                        assert.match(result.message, diagnostic);
                    } finally {
                        validator.close();
                    }
                });
            }
        }

        it("does not conflict with a global interface named like the probe", () => {
            const validator = validatorFor(
                "declare global { interface __TypeChatSchemaTarget { value: string; } }\nexport interface Event { value: string; }",
                "Event"
            );
            try {
                assert.ok(validator[typeChatSchemaValidation]().success);
                assert.ok(validator.validate({ value: "ok" }).success);
            } finally {
                validator.close();
            }
        });

        it("accepts a valid schema with required properties and caches the result", () => {
            const validator = validatorFor(
                "export interface Event { required: string; }",
                "Event"
            );
            try {
                const firstResult = validator[typeChatSchemaValidation]();
                assert.ok(firstResult.success, "schema validation must not require a JSON instance");
                assert.strictEqual(validator[typeChatSchemaValidation](), firstResult);
            } finally {
                validator.close();
            }
        });

        it("keeps response repair for a valid schema", async () => {
            const validator = validatorFor(smallSchema, "Point");
            let modelCalls = 0;
            const translator = createJsonTranslator({
                async complete() {
                    modelCalls++;
                    return {
                        success: true as const,
                        data: modelCalls === 1
                            ? '{"x":"not-a-number","y":2}'
                            : '{"x":1,"y":2}'
                    };
                }
            }, validator);

            try {
                const result = await translator.translate("point");
                assert.ok(result.success);
                assert.deepEqual(result.data, { x: 1, y: 2 });
                assert.equal(modelCalls, 2);
            } finally {
                validator.close();
            }
        });

        it("does not let a previous invalid instance poison schema preflight", async () => {
            const validator = validatorFor(smallSchema, "Point");
            let modelCalls = 0;
            const translator = createJsonTranslator({
                async complete() {
                    modelCalls++;
                    return { success: true as const, data: '{"x":1,"y":2}' };
                }
            }, validator);

            try {
                assert.equal(validator.validate({ x: 1, y: "invalid" }).success, false);
                const result = await translator.translate("point");
                assert.ok(result.success);
                assert.deepEqual(result.data, { x: 1, y: 2 });
                assert.equal(modelCalls, 1);
            } finally {
                validator.close();
            }
        });

        it("preserves legacy validator contracts and ignores validateSchema name collisions", async () => {
            type Point = { x: number };
            const backing = validatorFor<Point>("export interface Point { x: number; }", "Point");
            let schemaValidationCalls = 0;
            let modelCalls = 0;

            const legacyTypeScriptValidator: TypeScriptJsonValidator<Point> = {
                getSchemaText: backing.getSchemaText,
                getTypeName: backing.getTypeName,
                createModuleTextFromJson: backing.createModuleTextFromJson,
                validate: backing.validate,
                close: backing.close
            };
            const legacyCustomValidator = {
                getSchemaText: legacyTypeScriptValidator.getSchemaText,
                getTypeName: legacyTypeScriptValidator.getTypeName,
                validate: legacyTypeScriptValidator.validate,
                validateSchema: () => {
                    schemaValidationCalls++;
                    return true;
                }
            };
            const validator: TypeChatJsonValidator<Point> = legacyCustomValidator;
            const translator = createJsonTranslator({
                async complete() {
                    modelCalls++;
                    return { success: true as const, data: '{"x":1}' };
                }
            }, validator);

            try {
                const result = await translator.translate("point");
                assert.ok(result.success);
                assert.deepEqual(result.data, { x: 1 });
                assert.equal(modelCalls, 1);
                assert.equal(schemaValidationCalls, 0);
            } finally {
                legacyTypeScriptValidator.close();
            }
        });
    });

    describe("valid objects", () => {
        it("accepts an object that satisfies all required properties", () => {
            const v = validatorFor(largeSchema, "Doc");
            const result = v.validate({
                id: 1, title: "T", slug: "s", abstract: "a",
                description: "d", author: "au", date: "2024-01-01", category: "c"
            });
            assert.ok(result.success, "expected validation to succeed");
        });

        it("accepts an object that supplies optional properties", () => {
            const v = validatorFor(mixedSchema, "Item");
            const result = v.validate({
                id: 1, name: "n", tag: "t",
                extra1: "a", extra2: "b", extra3: "c", extra4: "d", extra5: "e"
            });
            assert.ok(result.success, "expected validation to succeed with optional props");
        });

        it("accepts an object that omits optional properties", () => {
            const v = validatorFor(mixedSchema, "Item");
            const result = v.validate({
                id: 1, name: "n",
                extra1: "a", extra2: "b", extra3: "c", extra4: "d", extra5: "e"
            });
            assert.ok(result.success, "expected validation to succeed without optional props");
        });
    });

    describe("serialized string enum values", () => {
        it("accepts a valid serialized string-enum value", () => {
            const v = validatorFor(stringEnumSchema, "Order");
            const result = v.validate({ currency: "EUR" });
            assert.ok(result.success, `expected validation to succeed, got: ${result.success ? "" : result.message}`);
        });

        it("rejects unknown values and member names that differ from their values", () => {
            const v = validatorFor(differingEnumValueSchema, "Subscription");
            const unknown = v.validate({ plan: "enterprise" });
            assert.ok(!unknown.success, "expected an unknown enum value to fail");
            assert.match(unknown.message, /not assignable to type/);
            assert.ok(unknown.message.includes("enterprise"), "expected the rejected value in the diagnostic");
            assert.ok(
                unknown.message.includes("basic") && unknown.message.includes("pro"),
                "expected the accepted enum values in the diagnostic"
            );

            const memberName = v.validate({ plan: "Basic" });
            assert.ok(!memberName.success, "expected an enum member name to fail when it differs from the value");
            assert.match(memberName.message, /not assignable to type/);
            assert.ok(memberName.message.includes("Basic"), "expected the rejected member name in the diagnostic");
        });

        it("validates enums in nested objects, arrays, unions, and index signatures", () => {
            const v = validatorFor(nestedEnumSchema, "Batch");
            const valid = v.validate({
                primary: { status: "active" },
                items: [{ status: "paused" }, { status: "active" }],
                lookup: { first: "active", second: "paused" },
                result: { ok: true, value: "active" }
            });
            assert.ok(valid.success, `expected nested enum values to pass, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({
                primary: { status: "active" },
                items: [{ status: "unknown" }],
                lookup: { first: "active" },
                result: { ok: false, error: "failed" }
            });
            assert.ok(!invalid.success, "expected an unknown nested enum value to fail");
            assert.match(invalid.message, /not assignable/);
        });

        it("accepts serialized values for an individual enum-member type", () => {
            const v = validatorFor(enumMemberTypeSchema, "Payment");
            const valid = v.validate({ currency: "EUR" });
            assert.ok(valid.success, `expected enum-member value to pass, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ currency: "USD" });
            assert.ok(!invalid.success, "expected a different enum member to fail");
            assert.match(invalid.message, /not assignable/);
        });

        it("preserves numeric enum validation", () => {
            const v = validatorFor(numericEnumSchema, "Config");
            const valid = v.validate({ priority: 1, count: 2 });
            assert.ok(valid.success, `expected numeric enum value to pass, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ priority: 3, count: 2 });
            assert.ok(!invalid.success, "expected a value outside the numeric enum to fail");
            assert.match(invalid.message, /not assignable/);
        });

        it("does not hide unrelated type errors", () => {
            const v = validatorFor(numericEnumSchema, "Config");
            const result = v.validate({ priority: 1, count: "two" });
            assert.ok(!result.success, "expected an unrelated type error to fail validation");
            assert.match(result.message, /not assignable/);
        });

        it("supports constant-folded string enum values", () => {
            const v = validatorFor(computedStringEnumSchema, "Order");
            const valid = v.validate({ currency: "EUR" });
            assert.ok(valid.success, `expected constant-folded enum value to pass, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ currency: "USD" });
            assert.ok(!invalid.success, "expected a value not produced by the computed member to fail");
            assert.match(invalid.message, /not assignable/);
        });

        it("validates enums in tuples, optional properties, and recursive schemas", () => {
            const v = validatorFor(recursiveEnumSchema, "Task");
            const valid = v.validate({
                phase: "done",
                next: { phase: "draft", history: ["done", 1] },
                history: ["draft", 2]
            });
            assert.ok(valid.success, `expected recursive enum values to pass, got: ${valid.success ? "" : valid.message}`);

            const invalidTuple = v.validate({ phase: "draft", history: ["unknown", 1] });
            assert.ok(!invalidTuple.success, "expected an unknown tuple enum value to fail");

            const invalidOptional = v.validate({
                phase: "draft",
                next: { phase: "unknown", history: ["done", 1] },
                history: ["draft", 2]
            });
            assert.ok(!invalidOptional.success, "expected an unknown optional-property enum value to fail");
        });

        it("does not widen branded string types", () => {
            const v = validatorFor(brandedStringSchema, "Response");
            const result = v.validate({ id: "plain-string" });
            assert.ok(!result.success, "expected a plain string not to satisfy a branded string type");
            assert.match(result.message, /not assignable/);
        });

        it("preserves non-primitive object constraints", () => {
            const v = validatorFor(objectConstraintSchema, "Response");
            const valid = v.validate({ value: [1, 2] });
            assert.ok(valid.success, `expected an array to satisfy object with length, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ value: "abc" });
            assert.ok(!invalid.success, "expected a primitive string not to satisfy object with length");
            assert.match(invalid.message, /not assignable/);
        });

        it("preserves rejection of call and construct signatures", () => {
            const callback = validatorFor(callbackSchema, "Response").validate({ callback: {} });
            assert.ok(!callback.success, "expected an empty object not to satisfy a call signature");
            assert.match(callback.message, /not assignable/);

            const factory = validatorFor(constructableSchema, "Response").validate({ factory: {} });
            assert.ok(!factory.success, "expected an empty object not to satisfy a construct signature");
            assert.match(factory.message, /not assignable/);
        });

        it("preserves rejection of Promise-shaped objects with non-callable methods", () => {
            const v = validatorFor(promiseSchema, "Response");
            const result = v.validate({ value: { then: {}, catch: {} } });
            assert.ok(!result.success, "expected non-callable then/catch methods to fail");
            assert.match(result.message, /not assignable/);
        });

        it("preserves class-instance constraints in an enum-free schema", () => {
            const v = validatorFor(classInstanceSchema, "Response");
            const result = v.validate({ token: { value: "unbranded" } });
            assert.ok(!result.success, "expected a plain object not to satisfy a class with private members");
            assert.match(result.message, /brand/);
        });

        it("preserves number, boolean, and string wrapper types when an enum is declared", () => {
            const v = validatorFor(wrapperTypeSchema, "Response");
            const valid = v.validate({ count: 1, enabled: true, label: "x", mode: "on" });
            assert.ok(valid.success, `expected primitive wrappers to accept primitives, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ count: "1", enabled: true, label: "x", mode: "on" });
            assert.ok(!invalid.success, "expected a string not to satisfy Number");
            assert.match(invalid.message, /not assignable/);
        });

        it("preserves object constraints when an enum is declared", () => {
            const v = validatorFor(objectConstraintEnumSchema, "Response");
            const valid = v.validate({ mode: "on", value: [1, 2] });
            assert.ok(valid.success, `expected an array to satisfy object with length, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ mode: "on", value: "abc" });
            assert.ok(!invalid.success, "expected a primitive string not to satisfy object with length");
            assert.match(invalid.message, /not assignable/);
        });

        it("preserves weak-type checking for all-optional object shapes", () => {
            const plain = validatorFor(weakObjectSchema, "Response");
            const withEnum = validatorFor(weakObjectEnumSchema, "Response");
            for (const value of [{ options: [] }, { options: { extra: 1 } }]) {
                const plainResult = plain.validate(value);
                const enumResult = withEnum.validate({ mode: "on", ...value });
                assert.ok(!plainResult.success, `expected the enum-free schema to reject ${JSON.stringify(value)}`);
                assert.ok(
                    !enumResult.success,
                    `expected the enum-bearing schema to reject ${JSON.stringify(value)}, got: ${enumResult.success ? "" : enumResult.message}`
                );
            }
            assert.ok(withEnum.validate({ mode: "on", options: {} }).success);
            assert.ok(withEnum.validate({ mode: "on", options: { enabled: true } }).success);
        });

        it("preserves the plain object constraint when an enum is declared", () => {
            const v = validatorFor(plainObjectEnumSchema, "Response");
            const valid = v.validate({ mode: "on", value: [] });
            assert.ok(valid.success, `expected an array to satisfy object, got: ${valid.success ? "" : valid.message}`);
            const invalid = v.validate({ mode: "on", value: "abc" });
            assert.ok(!invalid.success, "expected a primitive string not to satisfy object");
        });

        it("avoids an escaped identifier that resolves to the helper name", () => {
            const v = validatorFor(escapedJsonWireTypeSchema, "__TypeChatJsonWire");
            const generated = v.createModuleTextFromJson({ mode: "on" });
            assert.ok(generated.success);
            assert.match(generated.data, /type __TypeChatJsonWire_</);
            const result = v.validate({ mode: "on" });
            assert.ok(result.success, `expected the escaped target type to validate, got: ${result.success ? "" : result.message}`);
        });

        it("does not widen branded strings when an enum is declared", () => {
            const v = validatorFor(brandedStringEnumSchema, "Response");
            const result = v.validate({ mode: "on", id: "plain-string" });
            assert.ok(!result.success, "expected a plain string not to satisfy a branded string type");
            assert.match(result.message, /not assignable/);
        });

        it("preserves call and construct signatures when an enum is declared", () => {
            const v = validatorFor(callbackEnumSchema, "Response");
            const callback = v.validate({ mode: "on", callback: {}, factory: {} });
            assert.ok(!callback.success, "expected an empty object not to satisfy a call signature");
            assert.match(callback.message, /not assignable/);
        });

        it("preserves class-instance constraints when an enum is declared", () => {
            const v = validatorFor(classInstanceEnumSchema, "Response");
            const result = v.validate({ mode: "on", token: { value: "unbranded" } });
            assert.ok(!result.success, "expected a plain object not to satisfy a class with private members");
            assert.match(result.message, /brand/);
        });

        it("preserves numeric enums alongside string enums", () => {
            const v = validatorFor(numericAndStringEnumSchema, "Config");
            const valid = v.validate({ priority: 0, mode: "on", count: 1 });
            assert.ok(valid.success, `expected valid enum values to pass, got: ${valid.success ? "" : valid.message}`);

            const invalid = v.validate({ priority: 5, mode: "on", count: 1 });
            assert.ok(!invalid.success, "expected a value outside the numeric enum to fail");
            assert.match(invalid.message, /not assignable/);
        });

        it("does not hide unrelated type errors when a string enum is declared", () => {
            const v = validatorFor(numericAndStringEnumSchema, "Config");
            const result = v.validate({ priority: 0, mode: "on", count: "two" });
            assert.ok(!result.success, "expected an unrelated type error to fail validation");
            assert.match(result.message, /not assignable/);
        });

        it("expands the full missing-property list for a normalized target", () => {
            const v = validatorFor(wideEnumSchema, "Response");
            const result = v.validate({});
            assert.ok(!result.success, "expected missing properties to fail");
            for (const name of ["mode", "m1", "m2", "m3", "m4", "m5", "m6", "m7"]) {
                assert.ok(result.message.includes(name), `expected '${name}' in the message, got: ${result.message}`);
            }
            assert.ok(result.message.includes("Response"), `expected the original target type, got: ${result.message}`);
            assert.ok(!/and \d+ more/.test(result.message), `expected the complete list, got: ${result.message}`);
            assert.ok(!result.message.includes("TypeChatJsonWire"), `expected no helper name, got: ${result.message}`);
        });

        it("preserves quoted values that resemble helper names", () => {
            const v = validatorFor(quotedValueSchema, "Response");
            const result = v.validate({ mode: "on", note: "__TypeChatJsonWireObject<EUR>" });
            assert.ok(!result.success, "expected a fixed literal to reject another value");
            assert.ok(
                result.message.includes("__TypeChatJsonWireObject<EUR>"),
                `expected the rejected value verbatim, got: ${result.message}`
            );
        });

        it("terminates when an enum value spells the helper alias", () => {
            const v = validatorFor(helperSpellingEnumSchema, "Response");
            const result = v.validate({ mode: "other" });
            assert.ok(!result.success, "expected an unknown enum value to fail");
            assert.ok(result.message.length < 2000, `expected a bounded diagnostic, got ${result.message.length} chars`);
            assert.ok(!result.message.includes('""__TypeChat'), "expected no repeated quoting");
        });

        it("unwraps literal-bearing type arguments without rewriting them", () => {
            const v = validatorFor(literalTypeSchema, "Response");
            const result = v.validate({
                mode: "on",
                box: "not-an-object",
                item: { kind: "fixed", count: 1 }
            });
            assert.ok(!result.success, "expected literal type errors to fail");
            assert.ok(
                !result.message.includes("TypeChatJsonWire"),
                `expected no helper name, got: ${result.message}`
            );
            assert.ok(
                result.message.includes('Box<"fixed">'),
                `expected the literal type argument to be preserved, got: ${result.message}`
            );
        });

        it("does not treat a value containing 'and N more' as a truncated list", () => {
            const v = validatorFor(andMoreValueSchema, "Response");
            const result = v.validate({ note: "and 5 more" });
            assert.ok(!result.success, "expected the literal value to fail");
            assert.ok(
                result.message.includes("and 5 more"),
                `expected the rejected value to survive, got: ${result.message}`
            );
        });

        it("keeps nested missing-property diagnostics scoped to the nested type", () => {
            const v = validatorFor(nestedMissingSchema, "Response");
            const result = v.validate({ mode: "on", item: {} });
            assert.ok(!result.success, "expected missing nested properties to fail");
            assert.ok(result.message.includes("LargeItem"), `expected the nested type, got: ${result.message}`);
            assert.ok(result.message.includes("m1"), `expected a nested property name, got: ${result.message}`);
        });

        it("does not expand a nested recursive diagnostic as the outer declaration", () => {
            const v = validatorFor(recursiveMissingSchema, "Node");
            const result = v.validate({
                mode: "on",
                id: "root",
                a: "a", b: "b", c: "c", d: "d", e: "e",
                next: {}
            });
            assert.ok(!result.success, "expected the nested recursive value to fail");
            assert.ok(
                result.message.includes("Type '{}'"),
                `expected the nested source type, got: ${result.message}`
            );
            assert.ok(
                result.message.includes("mode") && result.message.includes("id"),
                `expected the nested missing properties, got: ${result.message}`
            );
            assert.ok(
                !result.message.includes("next: {}"),
                `expected no outer-instance expansion, got: ${result.message}`
            );
        });

        it("keeps internal helper names out of missing and excess property diagnostics", () => {
            const v = validatorFor(diagnosticSchema, "Response");
            const missing = v.validate({});
            assert.ok(!missing.success, "expected a missing property to fail");
            assert.ok(
                missing.message.includes("item"),
                `expected the property name in the message, got: ${missing.message}`
            );
            assert.ok(
                !missing.message.includes("TypeChatJsonWire"),
                `expected no internal type helper in the message, got: ${missing.message}`
            );

            const excess = v.validate({ item: { state: "active", count: 1, extra: true } });
            assert.ok(!excess.success, "expected an excess property to fail");
            assert.ok(
                excess.message.includes("extra"),
                `expected the property name in the message, got: ${excess.message}`
            );
            assert.ok(
                !excess.message.includes("TypeChatJsonWire"),
                `expected no internal type helper in the message, got: ${excess.message}`
            );
        });
    });

    describe("type mismatch errors (backward-compatible: unchanged code path)", () => {
        it("reports a type error when a property has the wrong type", () => {
            const v = validatorFor(smallSchema, "Point");
            const result = v.validate({ x: "not-a-number", y: 2 });
            assert.ok(!result.success, "expected validation to fail");
            assert.ok(
                result.message.includes("not assignable to type"),
                `expected type-mismatch message, got: ${result.message}`
            );
        });
    });

    describe("single missing required property (TS error 2741, unchanged code path)", () => {
        it("reports the missing property by name", () => {
            const v = validatorFor(smallSchema, "Point");
            const result = v.validate({ x: 1 });
            assert.ok(!result.success, "expected validation to fail");
            assert.ok(
                result.message.includes("'y'") && result.message.includes("missing"),
                `expected missing-property message, got: ${result.message}`
            );
        });
    });

    describe("2–5 missing required properties (TS error 2739, unchanged code path)", () => {
        it("lists all missing properties without truncation for 4 missing", () => {
            const schema = `export interface T { a: number; b: string; c: boolean; d: number; e: string; }`;
            const v = validatorFor(schema, "T");
            // Provide only 'a', missing b/c/d/e
            const result = v.validate({ a: 1 });
            assert.ok(!result.success, "expected validation to fail");
            for (const prop of ["b", "c", "d", "e"]) {
                assert.ok(
                    result.message.includes(prop),
                    `expected '${prop}' in error message, got: ${result.message}`
                );
            }
        });
    });

    describe("6+ missing required properties (TS error 2740 — the truncation fix)", () => {
        it("returns the full list of missing properties without truncation", () => {
            const v = validatorFor(largeSchema, "Doc");
            // Provide only id and title; slug/abstract/description/author/date/category are missing
            const result = v.validate({ id: 1, title: "Hello" });
            assert.ok(!result.success, "expected validation to fail");

            const missing = ["slug", "abstract", "description", "author", "date", "category"];
            for (const prop of missing) {
                assert.ok(
                    result.message.includes(prop),
                    `expected '${prop}' in error message but got: ${result.message}`
                );
            }
            assert.ok(
                !result.message.includes("more"),
                `error message should not contain "more" (truncation indicator), got: ${result.message}`
            );
        });

        it("excludes optional properties from the missing-properties list", () => {
            const v = validatorFor(mixedSchema, "Item");
            // Provide only id — name/extra1..5 are missing required; tag is optional
            const result = v.validate({ id: 1 });
            assert.ok(!result.success, "expected validation to fail");

            const requiredMissing = ["name", "extra1", "extra2", "extra3", "extra4", "extra5"];
            for (const prop of requiredMissing) {
                assert.ok(
                    result.message.includes(prop),
                    `expected '${prop}' in error message, got: ${result.message}`
                );
            }
            assert.ok(
                !result.message.includes("tag"),
                `optional property 'tag' should not appear in missing-properties message, got: ${result.message}`
            );
        });

        it("does not include 'and N more' truncation text", () => {
            const v = validatorFor(largeSchema, "Doc");
            const result = v.validate({});
            assert.ok(!result.success, "expected validation to fail");
            assert.ok(
                !/ and \d+ more/.test(result.message),
                `message should not contain "and N more", got: ${result.message}`
            );
        });
    });

    describe("getSchemaText and getTypeName", () => {
        it("returns the original schema text", () => {
            const v = validatorFor(smallSchema, "Point");
            assert.strictEqual(v.getSchemaText(), smallSchema);
        });

        it("returns the correct type name", () => {
            const v = validatorFor(smallSchema, "Point");
            assert.strictEqual(v.getTypeName(), "Point");
        });
    });

    describe("createModuleTextFromJson", () => {
        it("produces valid TypeScript module text for a simple object", () => {
            const v = validatorFor(smallSchema, "Point");
            const result = v.createModuleTextFromJson({ x: 1, y: 2 });
            assert.ok(result.success, "expected module text creation to succeed");
            assert.ok(result.data.includes("import { Point } from './schema'"));
            assert.ok(result.data.includes("const json: Point ="));
            assert.ok(!result.data.includes("TypeChatJsonWire"));
        });
    });

    describe("missing-property diagnostics with custom module text", () => {
        it("keeps a custom generic annotation as the diagnostic target", () => {
            const v = validatorFor<Record<string, unknown>>(genericWrapperSchema, "Response");
            v.createModuleTextFromJson = value => ({
                success: true,
                data: `import { Wrapper, Metadata } from './schema';\n` +
                    `const json: Wrapper<Metadata> = ${JSON.stringify(value)};`
            });
            const result = v.validate({
                payload: { m1: "", m2: "", m3: "", m4: "", m5: "", m6: "", m7: "" }
            });
            assert.ok(!result.success, "expected the missing wrapper fields to fail validation");
            assert.match(result.message, /Wrapper<Metadata>/);
            assert.ok(
                result.message.includes(": a, b, c, d, e, f, g"),
                `expected all missing wrapper properties, got: ${result.message}`
            );
            assert.ok(
                !result.message.includes("from type 'Metadata'"),
                `diagnostic must not target the unwrapped Metadata type, got: ${result.message}`
            );
        });

        it("leaves a property identifier that matches the enum helper unchanged", () => {
            const v = validatorFor<Record<string, unknown>>(stringEnumSchema, "Order");
            v.createModuleTextFromJson = () => ({
                success: true,
                data: `import { Currency, Order } from './schema';\n` +
                    `const json: Order = { currency: Currency.USD, __TypeChatJsonWireEnum: 1 };`
            });
            const result = v.validate({});
            assert.ok(!result.success, "expected the custom object literal to fail validation");
            assert.ok(
                result.message.includes("__TypeChatJsonWireEnum"),
                `expected the property name verbatim, got: ${result.message}`
            );
            assert.ok(
                !result.message.includes(`"USD" | "EUR"`),
                `expected no enum alias substitution, got: ${result.message}`
            );
        });

        it("preserves template literal types while unwrapping a helper", () => {
            const v = validatorFor<Record<string, unknown>>(stringEnumSchema, "Order");
            const generated = v.createModuleTextFromJson({});
            assert.ok(generated.success);
            const pattern = "`a>${string}`";
            const other = "`a<${string}`";
            const escaped = "`a\\`b>${string}`";
            const target = `{ pattern: ${pattern}; other: ${other}; escaped: ${escaped}; }`;
            const moduleText = generated.data.replace(
                "const json: __TypeChatJsonWire<Order> = {};",
                `const json: __TypeChatJsonWire<${target}> = 1;`
            );
            assert.notEqual(moduleText, generated.data);
            v.createModuleTextFromJson = () => ({ success: true, data: moduleText });

            const result = v.validate({});
            assert.ok(!result.success, "expected the template literal target to fail validation");
            assert.ok(
                result.message.includes(target),
                `expected template literal types verbatim, got: ${result.message}`
            );
            assert.ok(
                !result.message.includes("TypeChatJsonWire"),
                `expected no helper name, got: ${result.message}`
            );
        });
    });

    describe("standard-library helper types", () => {
        const helperSchema = `
declare function makeConfig(): { port: number; host: string };
declare function load(): Promise<{ id: string }>;
export interface Payload {
    values: ReadonlyArray<string>;
    readonlySyntax: readonly number[];
    counts: Record<string, number>;
    metadata: Partial<{ name: string; size: number }>;
    required: Required<{ id?: string }>;
    frozen: Readonly<{ x: number }>;
    picked: Pick<{ a: string; b: number }, "a">;
    omitted: Omit<{ a: string; b: number }, "b">;
    color: Exclude<"red" | "green" | "blue", "green">;
    kind: Extract<"a" | "b" | 1, string>;
    label: NonNullable<string | null>;
    config: ReturnType<typeof makeConfig>;
    loaded: Awaited<ReturnType<typeof load>>;
    nested: Awaited<Promise<Promise<number>>>;
    upper: Uppercase<"get" | "post">;
    lower: Lowercase<"HeLLo">;
    capitalized: Capitalize<"hello">;
    uncapitalized: Uncapitalize<"Hello">;
}`;
        const validPayload = {
            values: ["a"],
            readonlySyntax: [1],
            counts: { a: 1 },
            metadata: {},
            required: { id: "x" },
            frozen: { x: 1 },
            picked: { a: "x" },
            omitted: { a: "x" },
            color: "red",
            kind: "a",
            label: "l",
            config: { port: 1, host: "h" },
            loaded: { id: "x" },
            nested: 1,
            upper: "POST",
            lower: "hello",
            capitalized: "Hello",
            uncapitalized: "hello"
        };

        it("accepts a payload that satisfies every helper type", () => {
            const v = validatorFor(helperSchema, "Payload");
            const result = v.validate(validPayload);
            assert.ok(result.success, `expected validation to succeed, got: ${!result.success && result.message}`);
        });

        it("accepts the reproduction from issue #452", () => {
            const v = validatorFor(`
export interface Payload {
    values: ReadonlyArray<string>;
    counts: Record<string, number>;
    metadata: Partial<{ name: string }>;
}`, "Payload");
            const result = v.validate({ values: ["a"], counts: { a: 1 }, metadata: {} });
            assert.ok(result.success, `expected validation to succeed, got: ${!result.success && result.message}`);
        });

        const invalidCases: [string, object, RegExp][] = [
            ["ReadonlyArray element type", { values: [1] }, /'number' is not assignable to type 'string'/],
            ["readonly array syntax element type", { readonlySyntax: ["x"] }, /'string' is not assignable to type 'number'/],
            ["Record value type", { counts: { a: "1" } }, /'string' is not assignable to type 'number'/],
            ["Partial property type", { metadata: { name: 1 } }, /'number' is not assignable to type 'string'/],
            ["Required missing property", { required: {} }, /Property 'id' is missing/],
            ["Readonly property type", { frozen: { x: "1" } }, /'string' is not assignable to type 'number'/],
            ["Pick property type", { picked: { a: 1 } }, /'number' is not assignable to type 'string'/],
            ["Omit removed property", { omitted: { a: "x", b: 1 } }, /'"?b"?' does not exist/],
            ["Exclude removed member", { color: "green" }, /'"green"' is not assignable/],
            ["Extract non-matching member", { kind: 1 }, /'number' is not assignable/],
            ["NonNullable null", { label: null }, /'null' is not assignable to type 'string'/],
            ["ReturnType property type", { config: { port: "1", host: "h" } }, /'string' is not assignable to type 'number'/],
            ["Awaited property type", { loaded: { id: 1 } }, /'number' is not assignable to type 'string'/],
            ["nested Awaited type", { nested: "1" }, /'string' is not assignable to type 'number'/],
            ["Uppercase member", { upper: "PUT" }, /'"PUT"' is not assignable/],
            ["Lowercase value", { lower: "HELLO" }, /'"HELLO"' is not assignable to type '"hello"'/],
            ["Capitalize value", { capitalized: "hello" }, /'"hello"' is not assignable to type '"Hello"'/],
            ["Uncapitalize value", { uncapitalized: "Hello" }, /'"Hello"' is not assignable to type '"hello"'/],
        ];

        it("rejects any JSON value for a Promise property", () => {
            const v = validatorFor(`export interface Holder { value: Promise<number>; }`, "Holder");
            for (const value of [1, {}, { then: "x" }]) {
                const result = v.validate({ value });
                assert.ok(!result.success, `expected validation to fail for ${JSON.stringify(value)}`);
            }
        });

        for (const [name, override, expected] of invalidCases) {
            it(`rejects an invalid value for ${name}`, () => {
                const v = validatorFor(helperSchema, "Payload");
                const result = v.validate({ ...validPayload, ...override });
                assert.ok(!result.success, "expected validation to fail");
                assert.match(result.message, expected);
            });
        }
    });
});
