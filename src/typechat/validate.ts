import * as ts from 'typescript';
import { Response, success, error } from './response';

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { exec(string: string): unknown }`;

export interface TypeChatJsonValidator<T extends object> {
    get schema(): string;
    get typeName(): string;
    validate(jsonText: string): Response<T>;
}

export function createJsonValidator<T extends object = object>(schema: string, typeName: string): TypeChatJsonValidator<T> {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromJsonText("{}");
    return {
        get schema() { return schema },
        get typeName() { return typeName },
        validate
    };

    function validate(jsonText: string) {
        let jsonObject;
        try {
            jsonObject = JSON.parse(jsonText);
        }
        catch (e) {
            return error(e instanceof SyntaxError ? e.message : "JSON parse error");
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
