import * as ts from 'typescript';
import { Result, success, error } from './result';

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { exec(string: string): unknown }`;

/**
 * Represents an object that can validate JSON strings according to a given TypeScript schema.
 */
export interface TypeChatJsonValidator<T extends object> {
    /**
     * A string containing TypeScript source code for the validation schema.
     */
    schema: string;
    /**
     * A string containing the JSON object target type name in the schema.
     */
    typeName: string;
    /**
     * A boolean indicating whether to delete properties with null values from JSON objects. Some language
     * models (e.g. gpt-3.5-turbo) have a tendency to assign null values to optional properties instead of omitting
     * them. The default for this property is `false`, but an application can set the property to `true` for schemas
     * that don't permit null values.
     */
    stripNulls:  boolean;
    /**
     * Parses and validates the given JSON string according to the associated TypeScript schema. Returns a
     * `Success<T>` object containing the parsed JSON object if valudation was successful. Otherwise, returns
     * an `Error` object with a `message` property that contains the TypeScript compiler diagnostics.
     * @param jsonText The JSON string to validate.
     * @returns The parsed JSON object or the TypeScript compiler diagnostic messages.
     */
    validate(jsonText: string): Result<T>;
}

/**
 * Returns a JSON validator for a given TypeScript schema. Validation is performed by an in-memory instance of
 * the TypeScript compiler. The specified type argument `T` must be the same type as `typeName` in the given `schema`.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @returns A `TypeChatJsonValidator<T>` instance.
 */
export function createJsonValidator<T extends object = object>(schema: string, typeName: string): TypeChatJsonValidator<T> {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromJsonText("{}");
    const validator: TypeChatJsonValidator<T> = {
        schema,
        typeName,
        stripNulls: false,
        validate
    };
    return validator;

    function validate(jsonText: string) {
        let jsonObject;
        try {
            jsonObject = JSON.parse(jsonText);
        }
        catch (e) {
            return error(e instanceof SyntaxError ? e.message : "JSON parse error");
        }
        if (validator.stripNulls) {
            stripNulls(jsonObject);
            jsonText = JSON.stringify(jsonObject, undefined, 2);
        }
        const program = createProgramFromJsonText(jsonText, rootProgram);
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const diagnostics = programDiagnostics.map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText).join("\n");
            return error(diagnostics);
        }
        return success(jsonObject as T);
    }

    function createProgramFromJsonText(jsonText: string, oldProgram?: ts.Program) {
        const fileMap = new Map([
            createFileMapEntry("/lib.d.ts", libText),
            createFileMapEntry("/schema.ts", schema),
            createFileMapEntry("/json.ts", `import { ${typeName} } from './schema';\nconst json: ${typeName} = ${jsonText};\n`)
        ]);
        const host: ts.CompilerHost = {
            getSourceFile: fileName => fileMap.get(fileName),
            getDefaultLibFileName: () => "lib.d.ts",
            writeFile: () => {},
            getCurrentDirectory: () => "/",
            getCanonicalFileName: fileName => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\r",
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => "",
        };
        return ts.createProgram(Array.from(fileMap.keys()), options, host, oldProgram);
    }

    function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
        return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
    }
}

/**
 * Recursively delete properties with null values from the given object. This function assumes there are no
 * circular references in the object.
 * @param obj The object in which to strip null valued properties.
 */
function stripNulls(obj: any) {
    let keysToDelete: string[] | undefined;
    for (const k in obj) {
        const value = obj[k];
        if (value === null) {
            (keysToDelete ??= []).push(k);
        }
        else {
            if (Array.isArray(value)) {
                if (value.some(x => x === null)) {
                    obj[k] = value.filter(x => x !== null);
                }
            }
            if (typeof value === "object") {
                stripNulls(value);
            }
        }
    }
    if (keysToDelete) {
        for (const k of keysToDelete) {
            delete obj[k];
        }
    }
}
