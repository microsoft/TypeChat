import ts, { TypeNode } from "typescript";
import { error, Result, success } from "../result";
import { JsonSchemaOptions } from "../typechat";

type PendingSchema = {
    name: string;
    node: ts.Node;
    schema: Schema;
};

type Schema =
    | ArraySchema
    | ObjectSchema
    | ConstSchema
    | PrimitiveSchema
    | AnyOfSchema
    | RefSchema
    | EnumSchema
    | true;

type SchemaLiteral = string | number | boolean | null;

type ArraySchema = {
    type: "array";
    items: Schema;
};

type ConstSchema = {
    const: SchemaLiteral;
};

type ObjectSchema = {
    type: "object";
    properties: Record<string, Schema>;
    required: string[];
};

type PrimitiveSchema = {
    type: "string" | "number" | "boolean" | "null";
};

type AnyOfSchema = {
    anyOf: Schema[];
};

type RefSchema = {
    $ref: string;
};

type EnumSchema = {
    enum: SchemaLiteral[];
};

export function tsToJsonSchema(
    program: ts.Program,
    options?: JsonSchemaOptions
): Result<object> {
    const syntacticDiagnostics = program.getSyntacticDiagnostics();
    const programDiagnostics = syntacticDiagnostics.length
        ? syntacticDiagnostics
        : program.getSemanticDiagnostics();

    const sourceFiles = program.getSourceFiles();
    const schemaSourceFile = sourceFiles.find(
        (sourceFile) => sourceFile.fileName == "/schema.ts"
    );
    const schemaFileName = options?.fileName ?? "/schema.ts";
    if (!schemaSourceFile) {
        return error(`No schema.ts file found`);
    }

    if (programDiagnostics.length) {
        let errors = "";
        for (const diagnostic of programDiagnostics) {
            const fmtLoc = formatLocation(diagnostic.start!, diagnostic.file!);
            const message = ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                "\n"
            );
            const formatted = `${fmtLoc}: ${message}`;
            errors += formatted + "\n";
        }
        return error(errors);
    }

    const refs: [ts.Node, string][] = [];
    const defs: Record<string, PendingSchema> = {};
    const flatDefs: Record<string, Schema> = {};
    const diags: string[] = [];

    function addDef(node: ts.NamedDeclaration, schema: () => Schema) {
        const name = node.name?.getText();
        if (!name) {
            warn(node, "missing name");
            return;
        }
        if (defs[name]) {
            warn(node, `duplicate type name ${name}`);
            return;
        }

        defs[name] = {
            name,
            node,
            schema: schema(),
        };
        flatDefs[name] = defs[name].schema;
    }

    ts.forEachChild(schemaSourceFile, (node) => {
        if (ts.isTypeAliasDeclaration(node)) {
            if (node.typeParameters) {
                warn(node, "type parameters not supported");
            }
            addDef(node, () => mapTypeName(node.type));
        } else if (ts.isInterfaceDeclaration(node)) {
            if (node.typeParameters) {
                warn(node, "type parameters not supported");
            }
            if (node.heritageClauses) {
                warn(node, "interface extends not supported");
            }
            addDef(node, () => mapMembers(node.members));
        } else if (node.kind == ts.SyntaxKind.EndOfFileToken) {
            // skip
        } else {
            warn(node, `skipping node type ${ts.SyntaxKind[node.kind]}`);
        }
    });

    for (const [node, name] of refs) {
        const def = defs[name];
        if (!def) {
            err(node, `missing type definition for ${name}`);
        } else {
            // OK
        }
    }

    if (diags.length) {
        return error(diags.join("\n"));
    }
    return success({
        $defs: flatDefs,
    });

    function mapMembers(members: ts.NodeArray<ts.TypeElement>): ObjectSchema {
        const res: ObjectSchema = {
            type: "object",
            properties: {},
            required: [],
        };
        members.forEach((member) => {
            const name = member.name?.getText();
            if (!name) {
                warn(member, "member without name");
            } else if (ts.isPropertySignature(member)) {
                const isOptional = !!member.questionToken;
                if (!member.type) {
                    warn(member, "property signature without type");
                    res.properties[name] = true;
                } else {
                    res.properties[name] = mapTypeName(member.type, isOptional);
                }
                if (!isOptional) {
                    res.required.push(name);
                }
            } else if (ts.isMethodSignature(member)) {
                warn(member, "method signature not supported");
            } else {
                warn(
                    member,
                    `unsupported interface member ${ts.SyntaxKind[member.kind]}`
                );
            }
        });
        return res;
    }

    function mapAsConst(tp: ts.TypeNode): ConstSchema | null {
        if (!ts.isLiteralTypeNode(tp)) return null;

        const lit = tp.literal;
        if (ts.isStringLiteralLike(lit)) {
            const text = lit.getText();
            let c0 = text[0];
            if ((c0 == "'" || c0 == '"' || c0 == "`") && text.endsWith(c0)) {
                const quoted = '"' + text.slice(1, -1) + '"';
                try {
                    const parsed = JSON.parse(quoted);
                    return {
                        const: parsed,
                    };
                } catch (e) {
                    err(lit, `failed to parse string literal: ${text}`);
                    return null;
                }
            } else {
                err(lit, "string literal without quotes");
                return null;
            }
        } else if (ts.isNumericLiteral(lit)) {
            const text = lit.getText();
            const parsed = parseFloat(text);
            if (isNaN(parsed)) {
                err(lit, `failed to parse number literal: ${text}`);
                return null;
            }
            return {
                const: parsed,
            };
        } else if (lit.kind == ts.SyntaxKind.TrueKeyword) {
            return {
                const: true,
            };
        } else if (lit.kind == ts.SyntaxKind.FalseKeyword) {
            return {
                const: false,
            };
        }

        return null;
    }

    function mapTypeName(tp: TypeNode, skipUndefined?: boolean): Schema {
        const constSchema = mapAsConst(tp);
        if (constSchema) return constSchema;

        if (ts.isTypeLiteralNode(tp)) {
            return mapMembers(tp.members);
        } else if (ts.isTypeReferenceNode(tp)) {
            const name = tp.typeName.getText();
            if (name == "Array") {
                if (tp.typeArguments?.length != 1) {
                    warn(tp, "Array type reference without type argument");
                    return {
                        type: "array",
                        items: true,
                    };
                }
                return {
                    type: "array",
                    items: mapTypeName(tp.typeArguments![0]),
                };
            }
            if (name == "Number") {
                return {
                    type: "number",
                };
            }
            if (name == "String") {
                return {
                    type: "string",
                };
            }
            if (name == "Boolean") {
                return {
                    type: "boolean",
                };
            }

            refs.push([tp, name]);
            return {
                $ref: "#/$defs/" + name,
            };
        } else if (ts.isUnionTypeNode(tp)) {
            if (tp.types.length == 1) skipUndefined = false;
            const types = tp.types.filter(
                (t) => !(skipUndefined && t.kind == ts.SyntaxKind.UndefinedKeyword)
            );
            if (types.length == 1) {
                return mapTypeName(types[0]);
            }

            const consts = types.map(mapAsConst);
            if (consts.some((c) => c == null)) {
                return {
                    anyOf: types.map((t) => mapTypeName(t)),
                };
            } else {
                return {
                    enum: consts.map((c) => c!.const),
                };
            }
        } else if (ts.isArrayTypeNode(tp)) {
            return {
                type: "array",
                items: mapTypeName(tp.elementType),
            };
        } else if (ts.isParenthesizedTypeNode(tp)) {
            return mapTypeName(tp.type);
        } else if (tp.kind == ts.SyntaxKind.StringKeyword) {
            return {
                type: "string",
            };
        } else if (tp.kind == ts.SyntaxKind.BooleanKeyword) {
            return {
                type: "boolean",
            };
        } else if (tp.kind == ts.SyntaxKind.NumberKeyword) {
            return {
                type: "number",
            };
        } else if (tp.kind == ts.SyntaxKind.AnyKeyword) {
            return true;
        } else if (
            tp.kind == ts.SyntaxKind.UndefinedKeyword ||
            tp.kind == ts.SyntaxKind.NullKeyword
        ) {
            return {
                type: "null",
            };
        } else {
            warn(tp, "unhandled type kind: " + ts.SyntaxKind[tp.kind]);
            return true;
        }
    }

    function warn(node: ts.Node, msg: string) {
        if (options?.ignoreWarnings) return;
        err(node, msg);
    }

    function err(node: ts.Node, msg: string) {
        const formatted = `${nodeLocation(node)}: ${msg}`;
        diags.push(formatted);
    }

    function nodeLocation(node: ts.Node) {
        const sourceFile = node.getSourceFile() ?? schemaSourceFile;
        return formatLocation(node.getEnd(), sourceFile);
    }

    function formatLocation(
        pos: number,
        sourceFile: ts.SourceFile,
        fileName?: string
    ): string {
        const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            pos
        );
        if (!fileName)
            fileName =
                sourceFile == schemaSourceFile ? schemaFileName : sourceFile.fileName;
        return `${fileName}(${line + 1},${character + 1})`;
    }
}
