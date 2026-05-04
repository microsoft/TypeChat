import ts from 'typescript';
import { Result, success, error } from '../result';
import { TypeChatJsonValidator } from "../typechat";

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { toString(): string }
interface Function { prototype: unknown }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { test(string: string): boolean }`;

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
}

/**
 * Returns a JSON validator for a given TypeScript schema. Validation is performed by an in-memory instance of
 * the TypeScript compiler. The specified type argument `T` must be the same type as `typeName` in the given `schema`.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @returns A `TypeChatJsonValidator<T>` instance.
 */
export function createTypeScriptJsonValidator<T extends object = object>(schema: string, typeName: string): TypeScriptJsonValidator<T> {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromModuleText("");
    const validator: TypeScriptJsonValidator<T> = {
        getSchemaText: () => schema,
        getTypeName: () => typeName,
        createModuleTextFromJson,
        validate
    };
    return validator;

    function validate(jsonObject: object) {
        const moduleResult = validator.createModuleTextFromJson(jsonObject);
        if (!moduleResult.success) {
            return moduleResult;
        }
        const program = createProgramFromModuleText(moduleResult.data, rootProgram);
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const checker = program.getTypeChecker();
            const diagnostics = programDiagnostics.map(d => {
                const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
                // TS error 2740 truncates the missing-properties list to 4 items ("and N more").
                // Use the type checker to reconstruct the full list of missing required properties.
                if (d.code === 2740 && d.file) {
                    return expandMissingPropertiesMessage(checker, d.file) ?? message;
                }
                return message;
            }).join("\n");
            return error(diagnostics);
        }
        return success(jsonObject as T);
    }

    function expandMissingPropertiesMessage(checker: ts.TypeChecker, file: ts.SourceFile): string | undefined {
        for (const stmt of file.statements) {
            if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    if (decl.type && ts.isTypeReferenceNode(decl.type) && decl.initializer) {
                        const targetType = checker.getTypeAtLocation(decl.type);
                        const sourceType = checker.getTypeAtLocation(decl.initializer);
                        const sourceProps = new Set(sourceType.getProperties().map(p => p.name));
                        const missingProps = targetType.getProperties()
                            .filter(p => !(p.flags & ts.SymbolFlags.Optional) && !sourceProps.has(p.name))
                            .map(p => p.name);
                        if (missingProps.length > 0) {
                            const srcStr = checker.typeToString(sourceType, undefined, ts.TypeFormatFlags.NoTruncation);
                            const tgtStr = checker.typeToString(targetType, undefined, ts.TypeFormatFlags.NoTruncation);
                            return `Type '${srcStr}' is missing the following properties from type '${tgtStr}': ${missingProps.join(", ")}`;
                        }
                    }
                }
            }
        }
        return undefined;
    }

    function createModuleTextFromJson(jsonObject: object) {
        return success(`import { ${typeName} } from './schema';\nconst json: ${typeName} = ${JSON.stringify(jsonObject, undefined, 2)};\n`);
    }

    function createProgramFromModuleText(moduleText: string, oldProgram?: ts.Program) {
        const fileMap = new Map([
            createFileMapEntry("/lib.d.ts", libText),
            createFileMapEntry("/schema.ts", schema),
            createFileMapEntry("/json.ts", moduleText)
        ]);
        const host: ts.CompilerHost = {
            getSourceFile: fileName => fileMap.get(fileName),
            getDefaultLibFileName: () => "lib.d.ts",
            writeFile: () => {},
            getCurrentDirectory: () => "/",
            getCanonicalFileName: fileName => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => "",
        };
        return ts.createProgram(Array.from(fileMap.keys()), options, host, oldProgram);
    }

    function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
        return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
    }
}
