import { createRequire } from 'node:module';
import { Result, success, error } from '../result';
import { TypeChatJsonValidator } from "../typechat";

// TypeScript 7 ships as an ES module, while this package is emitted as CommonJS. Node's
// `require(esm)` support (Node >=22.12) lets us load it synchronously, and `resolution-mode`
// makes the TypeScript compiler resolve the ESM-only types from a CommonJS file.
// TODO: Revisit these `typescript/unstable/*` imports once a stable API is available.
type SyncModule = typeof import('typescript/unstable/sync', { with: { 'resolution-mode': 'import' } });
type FileSystemModule = typeof import('typescript/unstable/fs', { with: { 'resolution-mode': 'import' } });
type AstIsModule = typeof import('typescript/unstable/ast/is', { with: { 'resolution-mode': 'import' } });

type Checker = InstanceType<SyncModule['Checker']>;
type Diagnostic = import('typescript/unstable/sync', { with: { 'resolution-mode': 'import' } }).Diagnostic;
type SourceFile = import('typescript/unstable/ast', { with: { 'resolution-mode': 'import' } }).SourceFile;

const requireEsm = createRequire(__filename);
const { API, NodeBuilderFlags, SymbolFlags }: SyncModule = requireEsm('typescript/unstable/sync');
const { createVirtualFileSystem }: FileSystemModule = requireEsm('typescript/unstable/fs');
const { isTypeReferenceNode, isVariableStatement }: AstIsModule = requireEsm('typescript/unstable/ast/is');

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { toString(): string }
interface Function { prototype: unknown }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { test(string: string): boolean }`;

const configFileName = "/tsconfig.json";
const libFileName = "/lib.d.ts";
const schemaFileName = "/schema.ts";
const jsonFileName = "/json.ts";

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

/**
 * Returns a JSON validator for a given TypeScript schema. Validation is performed by an in-memory instance of
 * the TypeScript compiler. The specified type argument `T` must be the same type as `typeName` in the given `schema`.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @returns A `TypeChatJsonValidator<T>` instance.
 */
export function createTypeScriptJsonValidator<T extends object = object>(schema: string, typeName: string): TypeScriptJsonValidator<T> {
    const fileSystem = createVirtualFileSystem({
        [configFileName]: JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                noLib: true,
                types: []
            },
            files: [libFileName, schemaFileName, jsonFileName]
        }),
        [libFileName]: libText,
        [schemaFileName]: schema,
        [jsonFileName]: ""
    });
    const api = new API({ fs: fileSystem, cwd: "/" });
    api.updateSnapshot({ openProjects: [configFileName] });
    if (!fileSystem.writeFile) {
        throw new Error("The TypeScript virtual file system doesn't support writing files.");
    }
    const writeJsonFile = fileSystem.writeFile;
    const validator: TypeScriptJsonValidator<T> = {
        getSchemaText: () => schema,
        getTypeName: () => typeName,
        createModuleTextFromJson,
        validate,
        close: () => api.close()
    };
    return validator;

    function validate(jsonObject: object) {
        const moduleResult = validator.createModuleTextFromJson(jsonObject);
        if (!moduleResult.success) {
            return moduleResult;
        }
        writeJsonFile(jsonFileName, moduleResult.data);
        const snapshot = api.updateSnapshot({ fileChanges: { changed: [jsonFileName] } });
        const project = snapshot.getProject(configFileName);
        if (!project) {
            return error(`The TypeScript schema project '${configFileName}' couldn't be loaded.`);
        }
        const program = project.program;
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const checker = project.checker;
            const jsonFile = program.getSourceFile(jsonFileName);
            const diagnostics = programDiagnostics.map(d => {
                const message = flattenDiagnosticMessageText(d, "\n");
                // TS error 2740 truncates the missing-properties list to 4 items ("and N more").
                // Use the type checker to reconstruct the full list of missing required properties.
                if (d.code === 2740 && jsonFile && d.fileName === jsonFileName) {
                    return expandMissingPropertiesMessage(checker, jsonFile, d.pos) ?? message;
                }
                return message;
            }).join("\n");
            return error(diagnostics);
        }
        return success(jsonObject as T);
    }

    /**
     * Flattens a diagnostic and its chained messages into a single string, indenting each level of the chain.
     */
    function flattenDiagnosticMessageText(diagnostic: Diagnostic, newLine: string): string {
        const messages: string[] = [];
        appendMessages(diagnostic, 0);
        return messages.join(newLine);

        function appendMessages(d: Diagnostic, indent: number) {
            messages.push(indent ? "  ".repeat(indent) + d.text : d.text);
            for (const child of d.messageChain ?? []) {
                appendMessages(child, indent + 1);
            }
        }
    }

    /**
     * For TypeScript error 2740 (missing required properties, truncated with "and N more"),
     * uses the type checker to compute the full list of missing required properties from the
     * variable declaration at `position` in `file`. Returns `undefined` if the declaration
     * cannot be located or yields no missing properties (fallback to the original message).
     */
    function expandMissingPropertiesMessage(checker: Checker, file: SourceFile, position: number): string | undefined {
        for (const stmt of file.statements) {
            if (isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    // Match the specific declaration that spans the diagnostic position.
                    // Use getStart() to exclude leading trivia from the range check.
                    if (decl.getStart(file) <= position && position <= decl.end &&
                            decl.type && isTypeReferenceNode(decl.type) && decl.initializer) {
                        const targetType = checker.getTypeAtLocation(decl.type);
                        const sourceType = checker.getTypeAtLocation(decl.initializer);
                        if (!targetType || !sourceType) {
                            continue;
                        }
                        const sourceProps = new Set(checker.getPropertiesOfType(sourceType).map(p => p.name));
                        const missingProps = checker.getPropertiesOfType(targetType)
                            .filter(p => !(p.flags & SymbolFlags.Optional) && !sourceProps.has(p.name))
                            .map(p => p.name);
                        if (missingProps.length > 0) {
                            const srcStr = checker.typeToString(sourceType, undefined, NodeBuilderFlags.NoTruncation);
                            const tgtStr = checker.typeToString(targetType, undefined, NodeBuilderFlags.NoTruncation);
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
}
