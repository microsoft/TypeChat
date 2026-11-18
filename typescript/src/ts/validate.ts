// TODO: Revisit these `typescript/unstable/*` imports once a stable API is available.
import { API, NodeBuilderFlags, SymbolFlags, type Checker, type Diagnostic } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import type { Node, SourceFile } from 'typescript/unstable/ast';
import { isEnumDeclaration, isTypeReferenceNode, isVariableStatement } from 'typescript/unstable/ast/is';
import { Result, success, error } from '../result.js';
import { typeChatSchemaValidation, type TypeChatJsonValidator } from "../typechat.js";

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

const configFileName = "/tsconfig.json";
const libFileName = "/lib.d.ts";
const schemaFileName = "/schema.ts";
const jsonFileName = "/json.ts";
const schemaValidationFileName = "/schema-validation.ts";

/**
 * Returns a type alias name that does not collide with identifiers in the schema.
 */
function createUniqueJsonWireTypeName(schemaText: string): string {
    let name = "__TypeChatJsonWire";
    while (
        schemaText.includes(name) ||
        schemaText.includes(`${name}Enum`) ||
        schemaText.includes(`${name}Object`) ||
        schemaText.includes(`${name}Shape`)
    ) {
        name += "_";
    }
    return name;
}

/**
 * Collects the string values declared by enums in the schema. Limiting the JSON wire mapping to
 * these values leaves branded and opaque string types untouched.
 */
function getStringEnumValues(checker: Checker, sourceFile: SourceFile): string[] {
    const values = new Set<string>();
    sourceFile.forEachChild(function visit(node: Node) {
        if (isEnumDeclaration(node)) {
            for (const member of node.members) {
                const value = checker.getConstantValue(member);
                if (typeof value === "string") {
                    values.add(value);
                }
            }
        }
        node.forEachChild(visit);
    });
    return [...values];
}

/**
 * Maps serialized string-enum values back to their literal enum member types while preserving the
 * rest of the schema's structure. Class instances with private or protected members are left
 * unchanged because mapping their public keys would drop the nominal constraint that rejects
 * plain JSON objects.
 */
function createJsonWireTypeDefinition(typeName: string, stringEnumValues: readonly string[]): string {
    const enumValues = stringEnumValues.map(value => JSON.stringify(value)).join(" | ");
    return `type ${typeName}Enum = ${enumValues};
type ${typeName}Object<T> = { [K in keyof T]: ${typeName}<T[K]> };
type ${typeName}Shape<T> = { [K in keyof T]: T[K] };
type ${typeName}<T> =
    T extends ${typeName}Enum ? \`\${T}\` :
    T extends (...args: any[]) => any ? T :
    T extends abstract new (...args: any[]) => any ? T :
    T extends object ? (${typeName}Shape<T> extends T ?
        (string extends T ? ${typeName}Object<T> : ${typeName}Object<T> & object) : T) : T;`;
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

/**
 * Returns a JSON validator for a given TypeScript schema. Validation is performed by an in-memory instance of
 * the TypeScript compiler. The specified type argument `T` must be the same type as `typeName` in the given `schema`.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @param schemaValidationTypeName The exported schema type to check before translation. Defaults to `typeName`.
 * @returns A `TypeScriptJsonValidatorWithSchemaValidation<T>` instance.
 */
export function createTypeScriptJsonValidator<T extends object = object>(
    schema: string,
    typeName: string,
    schemaValidationTypeName: string = typeName
): TypeScriptJsonValidatorWithSchemaValidation<T> {
    const fileSystem = createVirtualFileSystem({
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
    const api = new API({ fs: fileSystem, cwd: "/" });
    if (!fileSystem.writeFile) {
        throw new Error("The TypeScript virtual file system doesn't support writing files.");
    }
    const writeFile = fileSystem.writeFile;
    const jsonWireTypeName = createUniqueJsonWireTypeName(schema);
    const initialSnapshot = api.updateSnapshot({ openProjects: [configFileName] });
    const schemaProject = initialSnapshot.getProject(configFileName);
    const schemaSourceFile = schemaProject?.program.getSourceFile(schemaFileName);
    const stringEnumValues = schemaProject && schemaSourceFile
        ? getStringEnumValues(schemaProject.checker, schemaSourceFile)
        : [];
    const jsonWireTypeDefinition = stringEnumValues.length
        ? createJsonWireTypeDefinition(jsonWireTypeName, stringEnumValues)
        : "";
    const jsonWireEnumValues = stringEnumValues.map(value => JSON.stringify(value)).join(" | ");
    let schemaValidationResult: Result<void> | undefined;
    const validator: TypeScriptJsonValidatorWithSchemaValidation<T> = {
        getSchemaText: () => schema,
        getTypeName: () => typeName,
        [typeChatSchemaValidation]: validateSchema,
        createModuleTextFromJson,
        validate,
        close: () => api.close()
    };
    return validator;

    function validateSchema(): Result<void> {
        if (schemaValidationResult) {
            return schemaValidationResult;
        }

        writeFile(
            schemaValidationFileName,
            `export type __TypeChatSchemaTarget = import('./schema').${schemaValidationTypeName};\n`
        );
        const snapshot = api.updateSnapshot({
            fileChanges: { changed: [schemaValidationFileName] }
        });
        const project = snapshot.getProject(configFileName);
        if (!project) {
            schemaValidationResult = error(
                `The TypeScript schema project '${configFileName}' couldn't be loaded.`
            );
            return schemaValidationResult;
        }

        const program = project.program;
        const schemaFiles = [schemaFileName, schemaValidationFileName]
            .map(fileName => program.getSourceFile(fileName))
            .filter((sourceFile): sourceFile is SourceFile => sourceFile !== undefined);
        if (schemaFiles.length !== 2) {
            schemaValidationResult = error("The TypeScript schema preflight files couldn't be loaded.");
            return schemaValidationResult;
        }
        const diagnostics = schemaFiles.flatMap(sourceFile => [
            ...program.getSyntacticDiagnostics(sourceFile.fileName),
            ...program.getSemanticDiagnostics(sourceFile.fileName)
        ]);
        schemaValidationResult = diagnostics.length
            ? error(
                diagnostics
                    .map(diagnostic =>
                        formatSchemaDiagnostic(
                            diagnostic,
                            diagnostic.fileName === undefined
                                ? undefined
                                : program.getSourceFile(diagnostic.fileName)
                        )
                    )
                    .join("\n")
            )
            : success(undefined);
        return schemaValidationResult;
    }

    function validate(jsonObject: object): Result<T> {
        const moduleResult = validator.createModuleTextFromJson(jsonObject);
        if (!moduleResult.success) {
            return "data" in moduleResult ? moduleResult : {
                ...moduleResult,
                success: false,
                message: moduleResult.message,
                data: jsonObject
            };
        }
        writeFile(jsonFileName, moduleResult.data);
        const snapshot = api.updateSnapshot({ fileChanges: { changed: [jsonFileName] } });
        const project = snapshot.getProject(configFileName);
        if (!project) {
            return error(`The TypeScript schema project '${configFileName}' couldn't be loaded.`, { data: jsonObject });
        }
        const program = project.program;
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const checker = project.checker;
            const jsonFile = program.getSourceFile(jsonFileName);
            const diagnostics = programDiagnostics.map(d => {
                const message = normalizeJsonWireTypeNames(flattenDiagnosticMessageText(d, "\n"));
                // TS error 2740 truncates the missing-properties list to 4 items ("and N more").
                // Use the type checker to reconstruct the full list of missing required properties.
                if (d.code === 2740 && jsonFile && d.fileName === jsonFileName) {
                    return normalizeJsonWireTypeNames(
                        expandMissingPropertiesMessage(checker, jsonFile, d.pos) ?? message
                    );
                }
                return message;
            }).join("\n");
            return error(diagnostics, { data: jsonObject });
        }
        return success(jsonObject as T);
    }

    /**
     * Removes internal helper names from diagnostics so callers and repair prompts see the schema
     * type that they wrote.
     */
    function normalizeJsonWireTypeNames(message: string): string {
        let result = message;
        let previous: string;
        do {
            previous = result;
            for (const name of [`${jsonWireTypeName}Shape`, `${jsonWireTypeName}Object`, jsonWireTypeName]) {
                result = stripTypeApplications(result, name);
            }
            if (jsonWireEnumValues) {
                result = result.split(`${jsonWireTypeName}Enum`).join(jsonWireEnumValues);
            }
        } while (result !== previous);
        return result;
    }

    function stripTypeApplications(text: string, name: string): string {
        const marker = `${name}<`;
        let result = "";
        let index = 0;
        while (true) {
            const start = text.indexOf(marker, index);
            if (start < 0) {
                return result + text.slice(index);
            }
            result += text.slice(index, start);
            let depth = 0;
            let end = start + name.length;
            for (; end < text.length; end++) {
                if (text[end] === "<") {
                    depth++;
                }
                else if (text[end] === ">" && text[end - 1] !== "=" && --depth === 0) {
                    break;
                }
            }
            if (end >= text.length) {
                return result + text.slice(start);
            }
            result += text.slice(start + name.length + 1, end);
            index = end + 1;
        }
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

    function formatSchemaDiagnostic(
        diagnostic: Diagnostic,
        sourceFile: SourceFile | undefined
    ): string {
        const message = flattenDiagnosticMessageText(diagnostic, "\n");
        if (!sourceFile || diagnostic.pos < 0) {
            return message;
        }
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            diagnostic.pos
        );
        const fileName = sourceFile.fileName === schemaFileName
            ? "schema.ts"
            : sourceFile.fileName === schemaValidationFileName
                ? "schema validation"
                : sourceFile.fileName;
        return `${fileName}(${line + 1},${character + 1}): ${message}`;
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
                        // Only the declaration generated by this validator wraps the schema type in
                        // the JsonWire helper. A custom createModuleTextFromJson may use any generic
                        // annotation, so unwrap only our own helper and keep other targets intact.
                        const isJsonWireReference = decl.type.typeName.getText(file) === jsonWireTypeName;
                        const targetTypeNode = isJsonWireReference
                            ? decl.type.typeArguments?.[0] ?? decl.type
                            : decl.type;
                        const targetType = checker.getTypeAtLocation(targetTypeNode);
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
        // String enums do not accept their serialized values in a normal enum-typed assignment.
        // The JsonWire helper maps each enum value back to its string literal while recursively
        // preserving object, array, tuple, optional-property, and union shapes. Numeric enums and
        // enum-free schemas continue to validate against the original type.
        const typeDefinition = jsonWireTypeDefinition ? `${jsonWireTypeDefinition}\n` : "";
        const jsonType = jsonWireTypeDefinition ? `${jsonWireTypeName}<${typeName}>` : typeName;
        return success(`import { ${typeName} } from './schema';\n${typeDefinition}const json: ${jsonType} = ${JSON.stringify(jsonObject, undefined, 2)};\n`);
    }
}
