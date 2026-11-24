import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";

// Run from a freshly built TypeChat typescript/ directory, not from this file's directory.
const fromCheckout = createRequire(resolve("package.json"));
const entry = relative(process.cwd(), fromCheckout.resolve("typechat/ts"));
assert.ok(!isAbsolute(entry) && !entry.startsWith(`..${sep}`), "The reproduction must use the current checkout.");
const { createTypeScriptJsonValidator } = fromCheckout("typechat/ts");
const { typeChatSchemaValidation } = fromCheckout("typechat");
const codeUnits = value => Array.from(
    { length: value.length }, (_, index) => value.charCodeAt(index).toString(16).padStart(4, "0")
);
const cases = [];
for (const [name, source, value] of [
    ["leading BOM control", String.raw`\uFEFFx`, "\uFEFFx"],
    ["BOM after lone surrogate", String.raw`\ud800\uFEFFx`, "\ud800\uFEFFx"]
]) {
    const schema = `export enum E { X = "${source}" } export interface Probe { value: E; }`;
    const validator = createTypeScriptJsonValidator(schema, "Probe");
    try {
        cases.push({
            name,
            schema,
            declaredValueCodeUnits: codeUnits(value),
            preflight: validator[typeChatSchemaValidation](),
            declared: validator.validate({ value }),
            altered: validator.validate({ value: value.replace("\uFEFF", "") })
        });
    } finally {
        validator.close();
    }
}
console.log(JSON.stringify({
    node: process.version,
    typechat: fromCheckout("./package.json").version,
    typescript: fromCheckout("typescript").version,
    entry,
    cases
}, null, 2));
for (const example of cases) {
    assert.equal(example.preflight.success, true, `${example.name}: schema should pass preflight.`);
    assert.equal(example.declared.success, true, `${example.name}: the declared value must validate.`);
    assert.equal(example.altered.success, false, `${example.name}: a different value must fail.`);
}
