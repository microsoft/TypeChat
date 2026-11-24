import { error, success, type Result } from "../result.js";

export const configFileName = "/tsconfig.json";
export const schemaFileName = "/schema.ts";
export const jsonFileName = "/json.ts";
export const schemaValidationFileName = "/schema-validation.ts";

export interface CompilerDiagnostic {
    code: number;
    text: string;
    pos: number;
    fileName?: string | undefined;
    messageChain?: readonly CompilerDiagnostic[] | undefined;
}

export interface CompilerTypeDescription {
    text: string;
    properties: readonly { name: string; optional: boolean }[];
}

export interface CompilerAssignment {
    start: number;
    typeEnd: number;
    getTypes(wireTypeName: string): {
        source: CompilerTypeDescription;
        target: CompilerTypeDescription;
    } | undefined;
}

export interface CompilerProject {
    getSyntacticDiagnostics(fileName?: string): readonly CompilerDiagnostic[];
    getSemanticDiagnostics(fileName?: string): readonly CompilerDiagnostic[];
    getSourceFile(fileName: string): {
        fileName: string;
        getLineAndCharacterOfPosition(position: number): { line: number; character: number };
    } | undefined;
    getStringEnumValues(): readonly string[];
    getAssignments(): readonly CompilerAssignment[];
}

export interface CompilerHost {
    update(changedFiles: readonly string[]): CompilerProject | undefined;
    writeFile(fileName: string, text: string): void;
    close(): void;
}

export interface TypeScriptCompiler {
    getStringEnumValues(): readonly string[];
    validateSchema(moduleText: string): Result<void>;
    validateJson(moduleText: string, wireTypeName: string): readonly string[];
    close(): void;
}

export function createCompiler(host: CompilerHost): TypeScriptCompiler {
    return {
        getStringEnumValues: () => host.update([])?.getStringEnumValues() ?? [],
        validateSchema(moduleText) {
            host.writeFile(schemaValidationFileName, moduleText);
            const project = host.update([schemaValidationFileName]);
            if (!project) {
                return error(`The TypeScript schema project '${configFileName}' couldn't be loaded.`);
            }
            const files = [schemaFileName, schemaValidationFileName].map(name => project.getSourceFile(name));
            if (files.some(file => !file)) {
                return error("The TypeScript schema preflight files couldn't be loaded.");
            }
            const messages: string[] = [];
            for (const file of files) {
                if (!file) {
                    continue;
                }
                for (const diagnostic of [
                    ...project.getSyntacticDiagnostics(file.fileName),
                    ...project.getSemanticDiagnostics(file.fileName)
                ]) {
                    const message = flattenDiagnostic(diagnostic);
                    const sourceFile = diagnostic.fileName === undefined
                        ? undefined : project.getSourceFile(diagnostic.fileName);
                    if (!sourceFile || diagnostic.pos < 0) {
                        messages.push(message);
                        continue;
                    }
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.pos);
                    const name = sourceFile.fileName === schemaFileName ? "schema.ts"
                        : sourceFile.fileName === schemaValidationFileName ? "schema validation"
                            : sourceFile.fileName;
                    messages.push(`${name}(${line + 1},${character + 1}): ${message}`);
                }
            }
            return messages.length ? error(messages.join("\n")) : success(undefined);
        },
        validateJson(moduleText, wireTypeName) {
            host.writeFile(jsonFileName, moduleText);
            const project = host.update([jsonFileName]);
            if (!project) {
                return [`The TypeScript schema project '${configFileName}' couldn't be loaded.`];
            }
            const syntactic = project.getSyntacticDiagnostics();
            const diagnostics = syntactic.length ? syntactic : project.getSemanticDiagnostics();
            return diagnostics.map(diagnostic => {
                const truncated = findDiagnostic(diagnostic, 2740);
                if (truncated?.fileName === jsonFileName) {
                    const expanded = expandMissingProperties(project.getAssignments(), truncated, wireTypeName);
                    if (expanded) {
                        return expanded;
                    }
                }
                return flattenDiagnostic(diagnostic);
            });
        },
        close: () => host.close()
    };
}

export function collectStringEnumValues<Node, Member>(
    source: Node,
    forEachChild: (node: Node, visit: (node: Node) => void) => void,
    enumMembers: (node: Node) => readonly Member[],
    getConstantValue: (member: Member) => string | number | undefined
): string[] {
    const values = new Set<string>();
    forEachChild(source, function visit(node) {
        for (const member of enumMembers(node)) {
            const value = getConstantValue(member);
            if (typeof value === "string") {
                values.add(value);
            }
        }
        forEachChild(node, visit);
    });
    return [...values];
}

export function describeAssignment<Node, Type>(
    start: number,
    typeEnd: number,
    annotationName: string,
    annotation: Node,
    typeArgument: Node | undefined,
    initializer: Node,
    getType: (node: Node) => Type | undefined,
    describeType: (type: Type) => CompilerTypeDescription
): CompilerAssignment {
    return {
        start,
        typeEnd,
        getTypes(wireTypeName) {
            const target = getType(annotationName === wireTypeName ? typeArgument ?? annotation : annotation);
            const source = getType(initializer);
            return target && source ? { target: describeType(target), source: describeType(source) } : undefined;
        }
    };
}

function findDiagnostic(diagnostic: CompilerDiagnostic, code: number): CompilerDiagnostic | undefined {
    if (diagnostic.code === code) {
        return diagnostic;
    }
    for (const child of diagnostic.messageChain ?? []) {
        const found = findDiagnostic(child, code);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function flattenDiagnostic(diagnostic: CompilerDiagnostic): string {
    const messages: string[] = [];
    append(diagnostic, 0);
    return messages.join("\n");

    function append(value: CompilerDiagnostic, indent: number) {
        messages.push("  ".repeat(indent) + value.text);
        for (const child of value.messageChain ?? []) {
            append(child, indent + 1);
        }
    }
}

function expandMissingProperties(
    assignments: readonly CompilerAssignment[],
    diagnostic: CompilerDiagnostic,
    wireTypeName: string
): string | undefined {
    const reportedTarget = / from type '(.+)': /.exec(diagnostic.text)?.[1];
    for (const assignment of assignments) {
        // A nested diagnostic must not be expanded using the outer declaration.
        if (assignment.start > diagnostic.pos || diagnostic.pos > assignment.typeEnd) {
            continue;
        }
        const types = assignment.getTypes(wireTypeName);
        if (!types) {
            continue;
        }
        const { target, source } = types;
        const present = new Set(source.properties.map(property => property.name));
        const missing = target.properties
            .filter(property => !property.optional && !present.has(property.name))
            .map(property => property.name);
        if (missing.length && (reportedTarget === undefined || reportedTarget === target.text ||
                reportedTarget === `${wireTypeName}Object<${target.text}>`)) {
            return `Type '${source.text}' is missing the following properties from type '${target.text}': ${missing.join(", ")}`;
        }
    }
    return undefined;
}
