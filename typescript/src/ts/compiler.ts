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

export interface CompilerEnumProbe {
    symbolId: number;
    end: number;
    enumName: string;
    properties: string[];
}

export interface CompilerEnumInfo {
    identifiers: Set<string>;
    probes: CompilerEnumProbe[];
}

export interface CompilerProject {
    getSyntacticDiagnostics(fileName?: string): readonly CompilerDiagnostic[];
    getSemanticDiagnostics(fileName?: string): readonly CompilerDiagnostic[];
    getSourceFile(fileName: string): {
        fileName: string;
        getLineAndCharacterOfPosition(position: number): { line: number; character: number };
    } | undefined;
    getEnumInfo(): Result<CompilerEnumInfo>;
    getEnumTypeTexts(aliases: ReadonlySet<string>): Result<readonly string[]>;
    getAssignments(): readonly CompilerAssignment[];
}

export interface CompilerHost {
    update(changedFiles: readonly string[]): CompilerProject | undefined;
    writeFile(fileName: string, text: string): void;
    close(): void;
}

export interface TypeScriptCompiler {
    getStringEnumTypeTexts(schema: string): Result<readonly string[]>;
    validateSchema(moduleText: string): Result<void>;
    validateJson(moduleText: string, wireTypeName: string): readonly string[];
    close(): void;
}

export function createCompiler(host: CompilerHost): TypeScriptCompiler {
    return {
        getStringEnumTypeTexts(schema) {
            const project = host.update([]);
            if (!project) {
                return error("The TypeScript schema file couldn't be loaded.");
            }
            const info = project.getEnumInfo();
            if (!info.success) {
                return info;
            }
            const { probes, identifiers } = info.data;
            if (!probes.length) {
                return success([]);
            }
            const aliases = new Set<string>();
            let querySchema = schema;
            for (const { end, enumName, properties } of probes.sort((a, b) => b.end - a.end)) {
                let name = `__TypeChatEnumValues${aliases.size}`;
                while (identifiers.has(name)) {
                    name += "_";
                }
                identifiers.add(name);
                aliases.add(name);
                // Preserve lexical scope and limit merged namespaces to their actual enum members.
                const keys = `keyof { ${properties.join("; ")} }`;
                const insertion = `\ntype ${name} = \`\${(typeof ${enumName})[${keys}]}\`;\n`;
                querySchema = querySchema.slice(0, end) + insertion + querySchema.slice(end);
            }
            host.writeFile(schemaFileName, querySchema);
            try {
                const queryProject = host.update([schemaFileName]);
                return queryProject
                    ? queryProject.getEnumTypeTexts(aliases)
                    : error(`The TypeScript string-enum query project '${configFileName}' couldn't be loaded.`);
            } finally {
                host.writeFile(schemaFileName, schema);
                host.update([schemaFileName]);
            }
        },
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

export function collectEnumInfo<Node>(
    source: Node,
    forEachChild: (node: Node, visit: (node: Node) => void) => void,
    identifierName: (node: Node) => string | undefined,
    enumProbe: (node: Node) => Result<CompilerEnumProbe | undefined>
): Result<CompilerEnumInfo> {
    const identifiers = new Set<string>();
    const probes = new Map<number, CompilerEnumProbe>();
    let failure: string | undefined;
    forEachChild(source, function visit(node) {
        if (failure !== undefined) {
            return;
        }
        const name = identifierName(node);
        if (name !== undefined) {
            identifiers.add(name);
        }
        const result = enumProbe(node);
        if (!result.success) {
            failure = result.message;
            return;
        }
        const probe = result.data;
        if (probe) {
            const previous = probes.get(probe.symbolId);
            if (previous) {
                previous.properties.push(...probe.properties);
            } else {
                probes.set(probe.symbolId, probe);
            }
        }
        forEachChild(node, visit);
    });
    return failure !== undefined ? error(failure) : success({ identifiers, probes: [...probes.values()] });
}

export function collectEnumTypeTexts<Node>(
    source: Node,
    aliases: ReadonlySet<string>,
    forEachChild: (node: Node, visit: (node: Node) => void) => void,
    aliasName: (node: Node) => string | undefined,
    resolve: (node: Node, name: string) => Result<readonly string[]>
): Result<readonly string[]> {
    const found = new Set<string>();
    const texts = new Set<string>();
    let failure: string | undefined;
    forEachChild(source, function visit(node) {
        if (failure !== undefined) {
            return;
        }
        const name = aliasName(node);
        if (name !== undefined && aliases.has(name)) {
            found.add(name);
            const result = resolve(node, name);
            if (!result.success) {
                failure = result.message;
                return;
            }
            for (const text of result.data) {
                texts.add(text);
            }
        }
        forEachChild(node, visit);
    });
    return failure !== undefined ? error(failure)
        : found.size !== aliases.size ? error("The TypeScript string-enum query aliases couldn't be loaded.")
            : success([...texts]);
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
