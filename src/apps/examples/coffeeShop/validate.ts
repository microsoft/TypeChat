import * as ts from 'typescript';
import { success, error, Result } from './result';

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { exec(string: string): unknown }`;

function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
    return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
}

export function validateJsonObject(json: object, schema: string, typeName: string): Result<object> {
    const options = { ...ts.getDefaultCompilerOptions(), strict: true, skipLibCheck: true, noLib: true, types: [] };
    const fileMap = new Map([
        createFileMapEntry("/lib.d.ts", libText),
        createFileMapEntry("/schema.ts", schema),
        createFileMapEntry("/json.ts", `import { ${typeName} } from './schema';\nconst json: ${typeName} = ${JSON.stringify(json)};`)
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
    const program = ts.createProgram(Array.from(fileMap.keys()), options, host);
    const diagnostics = program.getSemanticDiagnostics().map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText);
    return diagnostics.length === 0 ?
        success(json) :
        error("JSON instance does not match schema", diagnostics);
}

export function validateJsonText(text: string, schema: string, typeName: string): Result<object> {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (!(start >= 0 && end > start)) {
        return error("Response is not a JSON string");
    }
    try {
        const json = JSON.parse(text.substring(start, end + 1));
        return validateJsonObject(json, schema, typeName);
    }
    catch (e) {
        return error("JSON parse error");
    }
}
