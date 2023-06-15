import * as ts from 'typescript';

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

export class ValidationError extends Error {
    readonly diagnostics?: string[];
    constructor(message: string, diagnostics?: string[]) {
        super(message);
        this.diagnostics = diagnostics;
    }
}

export function validateJsonObject(json: object, schema: string, typeName: string): object {
    const options = { ...ts.getDefaultCompilerOptions(), strict: true, skipLibCheck: true, noLib: true, types: [] };
    const fileMap = new Map([
        createFileMapEntry("/lib.d.ts", libText),
        createFileMapEntry("/schema.ts", schema),
        createFileMapEntry("/json.ts", `import { ${typeName} } from './schema';\nconst json: ${typeName} = ${JSON.stringify(json)};\n`)
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
    const syntacticDiagnostics = program.getSyntacticDiagnostics();
    const diagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
    if (diagnostics.length) {
        const diagnosticMessages = diagnostics.map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText);
        throw new ValidationError("JSON instance does not match schema", diagnosticMessages);
    }
    return json;
}

export function parseAndValidateJsonText(text: string, schema: string, typeName: string): object {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (!(start >= 0 && end > start)) {
        throw new ValidationError("Response is not a JSON string");
    }
    const json = JSON.parse(text.substring(start, end + 1));
    validateJsonObject(json, schema, typeName);
    return json;
}
