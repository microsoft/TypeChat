import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTypeScriptJsonValidator } from "../dist/ts/index.js";

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

const callableSchema = `
export interface Response {
    callback: () => string;
    factory: new () => { ok: boolean };
}`;

const promiseLikeSchema = `
interface PromiseLike<T> {
    then(onFulfilled: (value: T) => unknown): unknown;
    catch(onRejected: (reason: unknown) => unknown): unknown;
}
export interface Response {
    value: PromiseLike<string>;
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
function validatorFor<T extends object>(schema: string, typeName: string) {
    return createTypeScriptJsonValidator<T>(schema, typeName);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTypeScriptJsonValidator", () => {

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
            assert.match(unknown.message, /not assignable/);

            const memberName = v.validate({ plan: "Basic" });
            assert.ok(!memberName.success, "expected an enum member name to fail when it differs from the value");
            assert.match(memberName.message, /not assignable/);
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

        it("preserves rejection of call and construct signatures", () => {
            const v = validatorFor(callableSchema, "Response");
            const callback = v.validate({ callback: {}, factory: { ok: true } });
            assert.ok(!callback.success, "expected an empty object not to satisfy a call signature");
            assert.match(callback.message, /not assignable/);

            const factory = v.validate({ callback: () => "ok", factory: {} });
            assert.ok(!factory.success, "expected an empty object not to satisfy a construct signature");
            assert.match(factory.message, /not assignable/);
        });

        it("preserves rejection of Promise-shaped objects with non-callable methods", () => {
            const v = validatorFor(promiseLikeSchema, "Response");
            const result = v.validate({ value: { then: {}, catch: {} } });
            assert.ok(!result.success, "expected non-callable then/catch methods to fail");
            assert.match(result.message, /not assignable/);
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
            assert.ok(result.data.includes("type __TypeChatJsonWire<T> = T extends string"));
            assert.ok(result.data.includes("const json: __TypeChatJsonWire<Point> ="));
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
    });
});
