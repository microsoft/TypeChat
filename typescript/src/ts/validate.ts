// TODO: Revisit these `typescript/unstable/*` imports once a stable API is available.
import { API, NodeBuilderFlags, SymbolFlags, type Checker, type Diagnostic } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import type { EnumDeclaration, Node, SourceFile } from 'typescript/unstable/ast';
import { isEnumDeclaration, isIdentifier, isTypeAliasDeclaration, isTypeReferenceNode, isVariableStatement } from 'typescript/unstable/ast/is';
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
    const initialSnapshot = api.updateSnapshot({ openProjects: [configFileName] });
    const schemaProject = initialSnapshot.getProject(configFileName);
    const schemaSourceFile = schemaProject?.program.getSourceFile(schemaFileName);
    const stringEnumTypeTextsResult = schemaProject && schemaSourceFile
        ? getStringEnumTypeTexts(schemaProject.checker, schemaSourceFile)
        : error("The TypeScript schema file couldn't be loaded.");
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
        close: () => api.close()
    };
    return validator;

    /**
     * Formats enum values as literal type text inside the compiler. Reading native API literal
     * values can corrupt lone surrogates or remove BOMs. Only enum declarations contribute values,
     * so branded and opaque strings retain their constraints.
     */
    function getStringEnumTypeTexts(checker: Checker, sourceFile: SourceFile): Result<string[]> {
        const declarations: EnumDeclaration[] = [];
        const identifiers = new Set<string>();
        sourceFile.forEachChild(function visit(node: Node) {
            if (isIdentifier(node)) {
                identifiers.add(node.text);
            }
            if (isEnumDeclaration(node) && checker.getTypeAtLocation(node.members)
                .some(type => type?.isStringLiteralType())) {
                declarations.push(node);
            }
            node.forEachChild(visit);
        });
        if (!declarations.length) {
            return success([]);
        }

        const aliases = new Set<string>();
        let querySchema = schema;
        for (const declaration of declarations.sort((a, b) => b.getEnd() - a.getEnd())) {
            let name = `__TypeChatEnumValues${aliases.size}`;
            while (identifiers.has(name)) {
                name += "_";
            }
            identifiers.add(name);
            aliases.add(name);
            // Keep each query in the enum's lexical scope, including private namespace enums.
            const insertion = `\ntype ${name} = \`\${${declaration.name.text} & string}\`;\n`;
            const end = declaration.getEnd();
            querySchema = querySchema.slice(0, end) + insertion + querySchema.slice(end);
        }

        writeFile(schemaFileName, querySchema);
        try {
            const snapshot = api.updateSnapshot({ fileChanges: { changed: [schemaFileName] } });
            const project = snapshot.getProject(configFileName);
            if (!project) {
                return error(`The TypeScript string-enum query project '${configFileName}' couldn't be loaded.`);
            }
            const queryFile = project.program.getSourceFile(schemaFileName);
            if (!queryFile) {
                return error("The TypeScript string-enum query file couldn't be loaded.");
            }
            const typeTexts = new Set<string>();
            const foundAliases = new Set<string>();
            let queryError: string | undefined;
            queryFile.forEachChild(function visit(node: Node) {
                if (queryError !== undefined) {
                    return;
                }
                if (isTypeAliasDeclaration(node) && aliases.has(node.name.text)) {
                    foundAliases.add(node.name.text);
                    const type = project.checker.getTypeAtLocation(node);
                    if (!type) {
                        queryError = `The TypeScript string-enum query '${node.name.text}' couldn't be resolved.`;
                        return;
                    }
                    const constituents = type.isUnionType() ? type.getTypes() : [type];
                    for (const constituent of constituents) {
                        if (!constituent.isStringLiteralType()) {
                            queryError = `The TypeScript string-enum query '${node.name.text}' didn't resolve to string literal types.`;
                            return;
                        }
                        typeTexts.add(project.checker.typeToString(
                            constituent, undefined, NodeBuilderFlags.NoTruncation
                        ));
                    }
                }
                node.forEachChild(visit);
            });
            if (queryError !== undefined) {
                return error(queryError);
            }
            if (foundAliases.size !== aliases.size) {
                return error("The TypeScript string-enum query aliases couldn't be loaded.");
            }
            return success([...typeTexts]);
        } finally {
            writeFile(schemaFileName, schema);
            api.updateSnapshot({ fileChanges: { changed: [schemaFileName] } });
        }
    }

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
            : stringEnumTypeError !== undefined
                ? error(stringEnumTypeError)
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
                // TS error 2740 truncates the missing-properties list to 4 items ("and N more").
                // Use the type checker to reconstruct the full list of missing required properties.
                // The truncated diagnostic may be a child of another one, for example an
                // intersection target, so search the message chain rather than the rendered text.
                const truncated = findDiagnosticWithCode(d, 2740);
                if (jsonFile && truncated?.fileName === jsonFileName) {
                    const expanded = expandMissingPropertiesMessage(checker, jsonFile, truncated.pos, truncated.text);
                    if (expanded) {
                        return normalizeJsonWireTypeNames(expanded);
                    }
                }
                return normalizeJsonWireTypeNames(flattenDiagnosticMessageText(d, "\n"));
            }).join("\n");
            return error(diagnostics, { data: jsonObject });
        }
        if (stringEnumTypeError !== undefined) {
            return error(stringEnumTypeError, { data: jsonObject });
        }
        return success(jsonObject as T);
    }

    function findDiagnosticWithCode(diagnostic: Diagnostic, code: number): Diagnostic | undefined {
        if (diagnostic.code === code) {
            return diagnostic;
        }
        for (const child of diagnostic.messageChain ?? []) {
            const match = findDiagnosticWithCode(child, code);
            if (match) {
                return match;
            }
        }
        return undefined;
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
    function expandMissingPropertiesMessage(
        checker: Checker,
        file: SourceFile,
        position: number,
        diagnosticText: string
    ): string | undefined {
        const reportedTarget = / from type '(.+)': /.exec(diagnosticText)?.[1];
        for (const stmt of file.statements) {
            if (isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    // Only the diagnostic attached to the declaration itself belongs to the outer
                    // instance. A nested property diagnostic also falls within decl.end, but its
                    // position is inside the initializer rather than the declaration prefix or
                    // type annotation.
                    if (decl.getStart(file) <= position &&
                            decl.type &&
                            position <= decl.type.getEnd() &&
                            isTypeReferenceNode(decl.type) && decl.initializer) {
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
                            // A nested diagnostic reports the nested type. Expanding it here
                            // would replace it with the outer declaration's missing properties.
                            if (reportedTarget !== undefined &&
                                    reportedTarget !== tgtStr &&
                                    reportedTarget !== `${jsonWireTypeName}Object<${tgtStr}>`) {
                                continue;
                            }
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
