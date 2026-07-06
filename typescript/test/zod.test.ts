import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createZodJsonValidator, getZodSchemaAsTypeScript } from "../dist/zod/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runs getZodSchemaAsTypeScript on a single named type and returns the result. */
function schemaOf<T extends z.ZodType>(name: string, type: T): string {
    return getZodSchemaAsTypeScript({ [name]: type });
}

// ---------------------------------------------------------------------------
// getZodSchemaAsTypeScript — primitive types
// ---------------------------------------------------------------------------

describe("getZodSchemaAsTypeScript", () => {

    describe("primitive types emit the correct TypeScript keyword", () => {

        it("z.string() → string", () => {
            assert.match(schemaOf("T", z.string()), /type T = string;/);
        });

        it("z.number() → number", () => {
            assert.match(schemaOf("T", z.number()), /type T = number;/);
        });

        it("z.boolean() → boolean", () => {
            assert.match(schemaOf("T", z.boolean()), /type T = boolean;/);
        });

        it("z.date() → Date", () => {
            assert.match(schemaOf("T", z.date()), /type T = Date;/);
        });

        it("z.undefined() → undefined", () => {
            assert.match(schemaOf("T", z.undefined()), /type T = undefined;/);
        });

        it("z.null() → null", () => {
            assert.match(schemaOf("T", z.null()), /type T = null;/);
        });

        it("z.unknown() → unknown", () => {
            assert.match(schemaOf("T", z.unknown()), /type T = unknown;/);
        });

    });

    // -----------------------------------------------------------------------
    // Array
    // -----------------------------------------------------------------------

    describe("z.array()", () => {

        it("produces an array type", () => {
            assert.match(schemaOf("T", z.array(z.string())), /type T = string\[\];/);
        });

        it("produces a nested array type", () => {
            assert.match(schemaOf("T", z.array(z.array(z.number()))), /type T = number\[\]\[\];/);
        });

    });

    // -----------------------------------------------------------------------
    // Object — emitted as interface
    // -----------------------------------------------------------------------

    describe("z.object()", () => {

        it("emits an interface (not a type alias) for object types", () => {
            const out = schemaOf("Point", z.object({ x: z.number(), y: z.number() }));
            assert.match(out, /^interface Point \{/m);
        });

        it("includes required properties", () => {
            const out = schemaOf("Point", z.object({ x: z.number(), y: z.number() }));
            assert.match(out, /x: number;/);
            assert.match(out, /y: number;/);
        });

        it("marks optional properties with ? and elides the undefined union", () => {
            const out = schemaOf("T", z.object({ a: z.string(), b: z.string().optional() }));
            assert.match(out, /a: string;/);
            assert.match(out, /b\?: string;/);
            // The optional field should not be emitted as "b: string | undefined"
            assert.doesNotMatch(out, /b: string \| undefined/);
        });

        it("adds inline comment from .describe() on a field", () => {
            const out = schemaOf("T", z.object({
                x: z.number().describe("x coordinate"),
            }));
            assert.match(out, /x: number; \/\/ x coordinate/);
        });

        it("does NOT add comment to field comment if the optional wrapper has a description", () => {
            // The description on the optional wrapper should appear before the field, not inline on it
            const out = schemaOf("T", z.object({
                size: z.string().optional().describe("The default is 'grande'"),
            }));
            assert.match(out, /\/\/ The default is 'grande'\s*\r?\n\s*size\?: string;/);
            assert.doesNotMatch(out, /size\?: string; \/\/ The default is 'grande'/);
        });

    });

    // -----------------------------------------------------------------------
    // Union and discriminated union
    // -----------------------------------------------------------------------

    describe("z.union()", () => {

        it("emits a union type", () => {
            assert.match(schemaOf("T", z.union([z.string(), z.number()])), /type T = string \| number;/);
        });

        it("handles a three-way union", () => {
            const out = schemaOf("T", z.union([z.string(), z.number(), z.boolean()]));
            assert.match(out, /string \| number \| boolean/);
        });

    });

    describe("z.discriminatedUnion()", () => {

        it("emits the options as a union", () => {
            const Cat = z.object({ kind: z.literal("cat") });
            const Dog = z.object({ kind: z.literal("dog") });
            const Pet = z.discriminatedUnion("kind", [Cat, Dog]);
            const out = schemaOf("Pet", Pet);
            // Both variants should appear in the output
            assert.match(out, /kind: "cat"/);
            assert.match(out, /kind: "dog"/);
        });

    });

    // -----------------------------------------------------------------------
    // Intersection
    // -----------------------------------------------------------------------

    describe("z.intersection()", () => {

        it("emits an intersection type using &", () => {
            const A = z.object({ a: z.string() });
            const B = z.object({ b: z.number() });
            const out = schemaOf("T", z.intersection(A, B));
            assert.match(out, /\{[^}]*a: string[^}]*\} & \{[^}]*b: number[^}]*\}/s);
        });

    });

    // -----------------------------------------------------------------------
    // Tuple
    // -----------------------------------------------------------------------

    describe("z.tuple()", () => {

        it("emits a simple tuple type", () => {
            assert.match(schemaOf("T", z.tuple([z.string(), z.number()])), /type T = \[string, number\];/);
        });

        it("emits a single-element tuple", () => {
            assert.match(schemaOf("T", z.tuple([z.boolean()])), /type T = \[boolean\];/);
        });

        it("emits a tuple with a rest element", () => {
            const out = schemaOf("T", z.tuple([z.string()]).rest(z.number()));
            assert.match(out, /\[string, \.\.\.number\[\]\]/);
        });

        it("emits a tuple with an optional element", () => {
            const out = schemaOf("T", z.tuple([z.string(), z.number().optional()]));
            assert.match(out, /\[string, number\?\]/);
        });

    });

    // -----------------------------------------------------------------------
    // Record
    // -----------------------------------------------------------------------

    describe("z.record()", () => {

        it("emits Record<K, V>", () => {
            assert.match(schemaOf("T", z.record(z.string(), z.number())), /type T = Record<string, number>;/);
        });

    });

    // -----------------------------------------------------------------------
    // Literal
    // -----------------------------------------------------------------------

    describe("z.literal()", () => {

        it("emits a string literal", () => {
            assert.match(schemaOf("T", z.literal("hello")), /type T = "hello";/);
        });

        it("emits a numeric literal", () => {
            assert.match(schemaOf("T", z.literal(42)), /type T = 42;/);
        });

        it("emits a boolean literal (true)", () => {
            assert.match(schemaOf("T", z.literal(true)), /type T = true;/);
        });

        it("emits a boolean literal (false)", () => {
            assert.match(schemaOf("T", z.literal(false)), /type T = false;/);
        });

        it("emits a union for multi-value literal (array form) — new Zod v4 overload", () => {
            // z.literal() in Zod v4 accepts an array (ReadonlyArray<Literal>) as a first-class overload
            const out = schemaOf("T", z.literal(["active", "inactive", "pending"]));
            assert.match(out, /type T = "active" \| "inactive" \| "pending";/);
        });

        it("emits 'null' for null literal", () => {
            // null is a valid Literal in Zod v4 (util.Literal = string | number | boolean | bigint | null | undefined)
            const NullLiteral = z.literal(null);
            assert.match(schemaOf("T", NullLiteral), /null/);
        });

    });

    // -----------------------------------------------------------------------
    // Enum
    // -----------------------------------------------------------------------

    describe("z.enum()", () => {

        it("emits a union of string literals", () => {
            const out = schemaOf("T", z.enum(["foo", "bar", "baz"]));
            assert.match(out, /type T = "foo" \| "bar" \| "baz";/);
        });

    });

    // -----------------------------------------------------------------------
    // Optional (standalone)
    // -----------------------------------------------------------------------

    describe("z.optional()", () => {

        it("emits T | undefined for a standalone optional", () => {
            const out = schemaOf("T", z.optional(z.string()));
            assert.match(out, /type T = string \| undefined;/);
        });

    });

    // -----------------------------------------------------------------------
    // Readonly
    // -----------------------------------------------------------------------

    describe("z.readonly()", () => {

        it("emits Readonly<T>", () => {
            assert.match(schemaOf("T", z.readonly(z.string())), /type T = Readonly<string>;/);
        });

    });

    // -----------------------------------------------------------------------
    // Descriptions
    // -----------------------------------------------------------------------

    describe("type-level .describe()", () => {

        it("emits a line comment before the type declaration", () => {
            const out = schemaOf("T", z.object({ x: z.number() }).describe("A 2D point"));
            assert.match(out, /\/\/ A 2D point\ninterface T/);
        });

        it("handles a multi-line description by splitting into multiple comment lines", () => {
            const out = schemaOf("T", z.string().describe("line one\nline two"));
            assert.match(out, /\/\/ line one\n\/\/ line two\ntype T/);
        });

    });

    // -----------------------------------------------------------------------
    // Named type references
    // -----------------------------------------------------------------------

    describe("named type references", () => {

        it("uses the name of a schema entry when that type appears inline", () => {
            const Inner = z.object({ value: z.string() });
            const Outer = z.object({ inner: Inner });
            const out = getZodSchemaAsTypeScript({ Inner, Outer });
            // Outer should reference Inner by name, not inline the definition again
            assert.match(out, /inner: Inner;/);
        });

        it("uses enum name in referencing object", () => {
            const Status = z.enum(["active", "inactive"]);
            const User = z.object({ status: Status });
            const out = getZodSchemaAsTypeScript({ Status, User });
            assert.match(out, /status: Status;/);
        });

    });

    // -----------------------------------------------------------------------
    // Output format: interface vs type alias
    // -----------------------------------------------------------------------

    describe("output format", () => {

        it("uses 'interface' for object types", () => {
            const out = schemaOf("MyObj", z.object({ a: z.string() }));
            assert.match(out, /^interface MyObj/m);
            assert.doesNotMatch(out, /^type MyObj/m);
        });

        it("uses 'type ... =' for non-object types", () => {
            const out = schemaOf("MyStr", z.string());
            assert.match(out, /^type MyStr = string;/m);
            assert.doesNotMatch(out, /^interface MyStr/m);
        });

        it("separates multiple type declarations with a blank line", () => {
            const out = getZodSchemaAsTypeScript({
                A: z.string(),
                B: z.number(),
            });
            // There should be a blank line between the two declarations
            assert.match(out, /type A = string;\n\ntype B = number;/);
        });

    });

    // -----------------------------------------------------------------------
    // Fallthrough: unknown type kind → any
    // -----------------------------------------------------------------------

    describe("unknown type kind", () => {

        it("emits 'any' for an unrecognized type kind", () => {
            // z.nan() is not explicitly handled — should fall through to 'any'
            const nan = z.nan();
            assert.match(schemaOf("T", nan), /any/);
        });

    });

});

// ---------------------------------------------------------------------------
// createZodJsonValidator
// ---------------------------------------------------------------------------

describe("createZodJsonValidator", () => {

    const SentimentSchema = {
        SentimentResponse: z.object({
            sentiment: z.enum(["negative", "neutral", "positive"])
                .describe("The sentiment of the text"),
        }),
    };

    describe("getTypeName()", () => {
        it("returns the target type name", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            assert.strictEqual(v.getTypeName(), "SentimentResponse");
        });
    });

    describe("getSchemaText()", () => {
        it("returns the TypeScript source for the schema", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            const text = v.getSchemaText();
            assert.match(text, /interface SentimentResponse/);
            assert.match(text, /"negative" \| "neutral" \| "positive"/);
        });

        it("is memoized (returns the same string reference on repeated calls)", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            assert.strictEqual(v.getSchemaText(), v.getSchemaText());
        });
    });

    describe("validate() — success", () => {

        it("returns success for a valid object", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            const result = v.validate({ sentiment: "positive" });
            assert.ok(result.success, `expected success but got: ${JSON.stringify(result)}`);
            assert.deepStrictEqual(result.data, { sentiment: "positive" });
        });

    });

    describe("validate() — failure", () => {

        it("returns an error for an invalid object", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            const result = v.validate({ sentiment: "very-happy" });
            assert.ok(!result.success, "expected failure");
            assert.ok(result.message.length > 0, "expected non-empty error message");
        });

        it("includes the path in the error message", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            const result = v.validate({ sentiment: 123 });
            assert.ok(!result.success, "expected failure");
            // The path ["sentiment"] should appear in the message
            assert.match(result.message, /sentiment/);
        });

        it("fails for an empty object that is missing required fields", () => {
            const v = createZodJsonValidator(SentimentSchema, "SentimentResponse");
            const result = v.validate({});
            assert.ok(!result.success, "expected failure for empty object");
        });

        it("fails for a deeply nested path error and includes the path", () => {
            const DeepSchema = {
                Root: z.object({
                    items: z.array(z.object({ count: z.number() })),
                }),
            };
            const v = createZodJsonValidator(DeepSchema, "Root");
            const result = v.validate({ items: [{ count: "not-a-number" }] });
            assert.ok(!result.success, "expected failure");
            assert.match(result.message, /items/);
        });

        it("separates multiple issues with a newline", () => {
            const MultiSchema = {
                Root: z.object({
                    a: z.number(),
                    b: z.number(),
                }),
            };
            const v = createZodJsonValidator(MultiSchema, "Root");
            const result = v.validate({ a: "x", b: "y" });
            assert.ok(!result.success, "expected failure for two invalid fields");
            // Two distinct issues should be produced and joined by a newline.
            assert.match(result.message, /\[("|')a\1\]/);
            assert.match(result.message, /\[("|')b\1\]/);
            assert.match(result.message, /\n/);
        });

    });

});
