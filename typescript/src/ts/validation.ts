import { Result, success, error } from '../result.js';
import { typeChatSchemaValidation, type TypeChatJsonValidator } from "../typechat.js";
import {
    configFileName, schemaFileName, jsonFileName, schemaValidationFileName, type TypeScriptCompiler
} from "./compiler.js";

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { toString(): string }
interface Function { prototype: unknown }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { test(string: string): boolean }
interface ReadonlyArray<T> { readonly length: number, readonly [n: number]: T }
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Record<K extends keyof any, T> = { [P in K]: T };
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type NonNullable<T> = T & {};
interface PromiseLike<T> { then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> }
interface Promise<T> { then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>; catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult> }
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;
type Awaited<T> = T extends null | undefined ? T : T extends object & { then(onfulfilled: infer F, ...args: infer _): any } ? F extends ((value: infer V, ...args: infer _) => any) ? Awaited<V> : never : T;
type Uppercase<S extends string> = intrinsic;
type Lowercase<S extends string> = intrinsic;
type Capitalize<S extends string> = intrinsic;
type Uncapitalize<S extends string> = intrinsic;`;

const libFileName = "/lib.d.ts";

/**
 * Returns a type alias name that does not collide with identifiers in the schema.
 */
function createUniqueJsonWireTypeName(
    schemaText: string,
    importedTypeName: string,
    stringEnumTypeTexts: readonly string[]
): string {
    let name = "__TypeChatJsonWire";
    while (
        importedTypeName === name ||
        importedTypeName === `${name}Enum` ||
        importedTypeName === `${name}Object` ||
        importedTypeName === `${name}Shape` ||
        schemaText.includes(name) ||
        schemaText.includes(`${name}Enum`) ||
        schemaText.includes(`${name}Object`) ||
        schemaText.includes(`${name}Shape`) ||
        stringEnumTypeTexts.some(typeText => typeText.includes(name))
    ) {
        name += "_";
    }
    return name;
}

/**
 * Maps serialized string-enum values back to their literal enum member types while preserving the
 * rest of the schema's structure. Class instances with private or protected members are left
 * unchanged because mapping their public keys would drop the nominal constraint that rejects
 * plain JSON objects.
 */
function createJsonWireTypeDefinition(typeName: string, stringEnumTypeTexts: readonly string[]): string {
    const enumValues = stringEnumTypeTexts.join(" | ");
    // Intersecting an all-optional mapped shape with `object` disables TypeScript's weak-type
    // check. Keep the constraint when an explicit intersection accepts arrays, or when the mapped
    // shape would newly accept a primitive that the original type rejects. Ordinary weak shapes
    // keep their weak-type check.
    return `type ${typeName}Enum = ${enumValues};
type ${typeName}Object<T> = { [K in keyof T]: ${typeName}<T[K]> };
type ${typeName}Shape<T> = { [K in keyof T]: T[K] };
type ${typeName}<T> =
    T extends ${typeName}Enum ? \`\${T}\` :
    T extends (...args: never[]) => unknown ? T :
    T extends abstract new (...args: never[]) => unknown ? T :
    T extends object ? (${typeName}Shape<T> extends T ?
        (string extends T
            ? ${typeName}Object<T>
            : number extends T
            ? ${typeName}Object<T>
            : boolean extends T
            ? ${typeName}Object<T>
            : string extends ${typeName}Object<T>
            ? ${typeName}Object<T> & object
            : number extends ${typeName}Object<T>
            ? ${typeName}Object<T> & object
            : boolean extends ${typeName}Object<T>
            ? ${typeName}Object<T> & object
            : unknown[] extends T
            ? ${typeName}Object<T> & object
            : ${typeName}Object<T>) : T) : T;`;
}

/**
 * Represents an object that can validate JSON strings according to a given TypeScript schema.
 */
export interface TypeScriptJsonValidator<T extends object> extends TypeChatJsonValidator<T> {
    /**
     * Transform JSON into TypeScript code for validation. Returns a `Success<string>` object if the conversion is
     * successful, or an `Error` object if the JSON can't be transformed. The returned TypeScript source code is
     * expected to be an ECMAScript module that imports one or more types from `"./schema"` and combines those
     * types and a representation of the JSON object in a manner suitable for type-checking by the TypeScript compiler.
     */
    createModuleTextFromJson(jsonObject: object): Result<string>;
    /**
     * Releases the TypeScript compiler instance backing this validator. The validator can't be used afterwards.
     * Calling `close` is optional; the compiler instance doesn't keep the host process alive.
     */
    close(): void;
}

export interface TypeScriptJsonValidatorWithSchemaValidation<T extends object> extends TypeScriptJsonValidator<T> {
    [typeChatSchemaValidation](): Result<void>;
}

export function createTypeScriptJsonValidatorWithCompiler<T extends object = object>(
    schema: string,
    typeName: string,
    schemaValidationTypeName: string,
    createCompiler: (files: Record<string, string>) => TypeScriptCompiler
): TypeScriptJsonValidatorWithSchemaValidation<T> {
    let compiler: TypeScriptCompiler | undefined = createCompiler({
        [configFileName]: JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                noLib: true,
                types: []
            },
            files: [libFileName, schemaFileName, jsonFileName, schemaValidationFileName]
        }),
        [libFileName]: libText,
        [schemaFileName]: schema,
        [jsonFileName]: "",
        [schemaValidationFileName]: ""
    });
    let stringEnumTypeTextsResult: Result<readonly string[]>;
    try {
        stringEnumTypeTextsResult = compiler.getStringEnumTypeTexts(schema);
    } catch (cause) {
        compiler.close();
        throw cause;
    }
    const stringEnumTypeTexts = stringEnumTypeTextsResult.success ? stringEnumTypeTextsResult.data : [];
    const stringEnumTypeError = stringEnumTypeTextsResult.success ? undefined : stringEnumTypeTextsResult.message;
    const jsonWireTypeName = createUniqueJsonWireTypeName(schema, typeName, stringEnumTypeTexts);
    const jsonWireTypeDefinition = stringEnumTypeTexts.length
        ? createJsonWireTypeDefinition(jsonWireTypeName, stringEnumTypeTexts)
        : "";
    const jsonWireEnumValues = stringEnumTypeTexts.join(" | ");
    let schemaValidationResult: Result<void> | undefined;
    const validator: TypeScriptJsonValidatorWithSchemaValidation<T> = {
        getSchemaText: () => schema,
        getTypeName: () => typeName,
        [typeChatSchemaValidation]: validateSchema,
        createModuleTextFromJson,
        validate,
        close() {
            const instance = compiler;
            compiler = undefined;
            instance?.close();
        }
    };
    return validator;

    function openCompiler(): TypeScriptCompiler {
        if (!compiler) {
            throw new Error("The TypeScript validator has been closed.");
        }
        return compiler;
    }

    function validateSchema(): Result<void> {
        const instance = openCompiler();
        if (schemaValidationResult) {
            return schemaValidationResult;
        }

        schemaValidationResult = instance.validateSchema(
            `export type __TypeChatSchemaTarget = import('./schema').${schemaValidationTypeName};\n`
        );
        if (schemaValidationResult.success && stringEnumTypeError !== undefined) {
            schemaValidationResult = error(stringEnumTypeError);
        }
        return schemaValidationResult;
    }

    function validate(jsonObject: object): Result<T> {
        const instance = openCompiler();
        const moduleResult = validator.createModuleTextFromJson(jsonObject);
        if (!moduleResult.success) {
            return "data" in moduleResult ? moduleResult : {
                ...moduleResult,
                success: false,
                message: moduleResult.message,
                data: jsonObject
            };
        }
        const messages = instance.validateJson(moduleResult.data, jsonWireTypeName);
        if (messages.length) {
            return error(messages.map(normalizeJsonWireTypeNames).join("\n"), { data: jsonObject });
        }
        if (stringEnumTypeError !== undefined) {
            return error(stringEnumTypeError, { data: jsonObject });
        }
        return success(jsonObject as T);
    }

    /**
     * Removes internal helper names from diagnostics so callers and repair prompts see the schema
     * type that they wrote.
     */
    function normalizeJsonWireTypeNames(message: string): string {
        if (!jsonWireTypeDefinition) {
            return message;
        }
        return normalizeDiagnosticText(message);
    }

    /**
     * Unwraps helper type applications while leaving string and template-literal spans verbatim.
     * Type arguments can contain either form, so their punctuation never terminates an enclosing
     * application.
     */
    function normalizeDiagnosticText(text: string, insideHelper = false): string {
        const names = [`${jsonWireTypeName}Shape`, `${jsonWireTypeName}Object`, jsonWireTypeName];
        let result = "";
        let index = 0;
        while (index < text.length) {
            if (text[index] === '"') {
                const end = skipStringLiteral(text, index);
                result += text.slice(index, end);
                index = end;
                continue;
            }
            if (text[index] === "`") {
                const end = skipTemplateLiteral(text, index);
                result += text.slice(index, end);
                index = end;
                continue;
            }
            let matched = false;
            for (const name of names) {
                if (!text.startsWith(name, index) || text[index + name.length] !== "<") {
                    continue;
                }
                const end = findTypeArgumentEnd(text, index + name.length);
                if (end < 0) {
                    continue;
                }
                result += normalizeDiagnosticText(text.slice(index + name.length + 1, end), true);
                index = end + 1;
                if (name.endsWith("Object")) {
                    // Drop the `& object` guard from the rendered helper so diagnostics mention
                    // the schema type alone.
                    const guard = /^\s*&\s*object\b/.exec(text.slice(index));
                    if (guard) {
                        index += guard[0].length;
                    }
                }
                matched = true;
                break;
            }
            if (matched) {
                continue;
            }
            const enumName = `${jsonWireTypeName}Enum`;
            if (insideHelper && jsonWireEnumValues && text.startsWith(enumName, index)) {
                // Replace the alias once. Re-scanning the substituted text could turn a value
                // that spells the alias into an unbounded expansion.
                result += jsonWireEnumValues;
                index += enumName.length;
                continue;
            }
            result += text[index++];
        }
        return result;
    }

    function skipStringLiteral(text: string, start: number): number {
        let index = start + 1;
        while (index < text.length) {
            if (text[index] === "\\") {
                index += 2;
            }
            else if (text[index] === '"') {
                return index + 1;
            }
            else {
                index++;
            }
        }
        return text.length;
    }

    /**
     * Skips a template literal type, including escaped characters and nested `${...}`
     * interpolations. Diagnostic type text can contain any of these, and their punctuation must
     * not be mistaken for an enclosing type argument list.
     */
    function skipTemplateLiteral(text: string, start: number): number {
        let index = start + 1;
        while (index < text.length) {
            if (text[index] === "\\") {
                index += 2;
            }
            else if (text[index] === "`") {
                return index + 1;
            }
            else if (text[index] === "$" && text[index + 1] === "{") {
                index = skipTemplateExpression(text, index + 2);
            }
            else {
                index++;
            }
        }
        return text.length;
    }

    function skipTemplateExpression(text: string, start: number): number {
        let depth = 1;
        let index = start;
        while (index < text.length) {
            if (text[index] === '"') {
                index = skipStringLiteral(text, index);
            }
            else if (text[index] === "'") {
                index = skipSingleQuotedString(text, index);
            }
            else if (text[index] === "`") {
                index = skipTemplateLiteral(text, index);
            }
            else if (text[index] === "{") {
                depth++;
                index++;
            }
            else if (text[index] === "}" && --depth === 0) {
                return index + 1;
            }
            else {
                index++;
            }
        }
        return text.length;
    }

    function skipSingleQuotedString(text: string, start: number): number {
        let index = start + 1;
        while (index < text.length) {
            if (text[index] === "\\") {
                index += 2;
            }
            else if (text[index] === "'") {
                return index + 1;
            }
            else {
                index++;
            }
        }
        return text.length;
    }

    function findTypeArgumentEnd(text: string, openBracket: number): number {
        let depth = 0;
        for (let index = openBracket; index < text.length; index++) {
            if (text[index] === '"') {
                index = skipStringLiteral(text, index) - 1;
            }
            else if (text[index] === "`") {
                index = skipTemplateLiteral(text, index) - 1;
            }
            else if (text[index] === "<") {
                depth++;
            }
            else if (text[index] === ">" && text[index - 1] !== "=" && --depth === 0) {
                return index;
            }
        }
        return -1;
    }

    function createModuleTextFromJson(jsonObject: object) {
        // String enums do not accept their serialized values in a normal enum-typed assignment.
        // The JsonWire helper maps each enum value back to its string literal while recursively
        // preserving object, array, tuple, optional-property, and union shapes. Numeric enums and
        // enum-free schemas continue to validate against the original type.
        const typeDefinition = jsonWireTypeDefinition ? `${jsonWireTypeDefinition}\n` : "";
        const jsonType = jsonWireTypeDefinition ? `${jsonWireTypeName}<${typeName}>` : typeName;
        return success(`import { ${typeName} } from './schema';\n${typeDefinition}const json: ${jsonType} = ${JSON.stringify(jsonObject, undefined, 2)};\n`);
    }
}
