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
        });
    });
});
