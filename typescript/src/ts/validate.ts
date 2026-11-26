// TODO: Revisit these `typescript/unstable/*` imports once a stable API is available.
import { API, NodeBuilderFlags, SymbolFlags, type Project, type Type } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import type { Node } from "typescript/unstable/ast";
import { isEnumDeclaration, isIdentifier, isTypeAliasDeclaration, isTypeReferenceNode, isVariableStatement } from "typescript/unstable/ast/is";
import { error, success } from "../result.js";
import {
    collectEnumInfo, collectEnumTypeTexts, configFileName, createCompiler, describeAssignment, jsonFileName, schemaFileName,
    type CompilerAssignment, type CompilerProject, type CompilerTypeDescription
} from "./compiler.js";
import {
    createTypeScriptJsonValidatorWithCompiler, type TypeScriptJsonValidatorWithSchemaValidation
} from "./validation.js";

export type { TypeScriptJsonValidator, TypeScriptJsonValidatorWithSchemaValidation } from "./validation.js";

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
    return createTypeScriptJsonValidatorWithCompiler<T>(schema, typeName, schemaValidationTypeName, files => {
        const fs = createVirtualFileSystem(files);
        if (!fs.writeFile) {
            throw new Error("The TypeScript virtual file system doesn't support writing files.");
        }
        const api = new API({ fs, cwd: "/" });
        let opened = false;
        return createCompiler({
            writeFile: fs.writeFile,
            update(changedFiles) {
                const snapshot = api.updateSnapshot(opened
                    ? { fileChanges: { changed: [...changedFiles] } }
                    : { openProjects: [configFileName] });
                opened = true;
                const project = snapshot.getProject(configFileName);
                return project && projectView(project);
            },
            close: () => api.close()
        });
    });
}

function projectView({ program, checker }: Project): CompilerProject {
    function describeType(type: Type): CompilerTypeDescription {
        return {
            text: checker.typeToString(type, undefined, NodeBuilderFlags.NoTruncation),
            properties: checker.getPropertiesOfType(type).map(property => ({
                name: property.name,
                optional: !!(property.flags & SymbolFlags.Optional)
            }))
        };
    }
    return {
        getSourceFile: name => program.getSourceFile(name),
        getSyntacticDiagnostics: name => program.getSyntacticDiagnostics(name),
        getSemanticDiagnostics: name => program.getSemanticDiagnostics(name),
        getEnumInfo() {
            const source = program.getSourceFile(schemaFileName);
            return source ? collectEnumInfo<Node>(
                source,
                (node, visit) => node.forEachChild(visit),
                node => isIdentifier(node) ? node.text : undefined,
                node => {
                    if (!isEnumDeclaration(node)) {
                        return success(undefined);
                    }
                    const types = checker.getTypeAtLocation(node.members);
                    const members = node.members.filter((_, index) => types[index]?.isStringLiteralType());
                    if (!members.length) {
                        return success(undefined);
                    }
                    const symbol = checker.getSymbolAtLocation(node.name);
                    return symbol ? success({
                        symbolId: symbol.id,
                        end: node.getEnd(),
                        enumName: node.name.text,
                        properties: members.map(member => `${member.name.getText(source)}: unknown`)
                    }) : error(`The TypeScript enum '${node.name.text}' couldn't be resolved.`);
                }
            ) : error("The TypeScript schema file couldn't be loaded.");
        },
        getEnumTypeTexts(aliases) {
            const source = program.getSourceFile(schemaFileName);
            return source ? collectEnumTypeTexts<Node>(
                source, aliases,
                (node, visit) => node.forEachChild(visit),
                node => isTypeAliasDeclaration(node) ? node.name.text : undefined,
                (node, name) => {
                    const type = checker.getTypeAtLocation(node);
                    if (!type) {
                        return error(`The TypeScript string-enum query '${name}' couldn't be resolved.`);
                    }
                    const members = type.isUnionType() ? type.getTypes() : [type];
                    return members.some(member => !member.isStringLiteralType())
                        ? error(`The TypeScript string-enum query '${name}' didn't resolve to string literal types.`)
                        : success(members.map(member => checker.typeToString(member, undefined, NodeBuilderFlags.NoTruncation)));
                }
            ) : error("The TypeScript string-enum query file couldn't be loaded.");
        },
        getAssignments() {
            const file = program.getSourceFile(jsonFileName);
            const assignments: CompilerAssignment[] = [];
            for (const statement of file?.statements ?? []) {
                if (!isVariableStatement(statement)) {
                    continue;
                }
                for (const declaration of statement.declarationList.declarations) {
                    const { type, initializer } = declaration;
                    if (type && isTypeReferenceNode(type) && initializer && file) {
                        assignments.push(describeAssignment<Node, Type>(
                            declaration.getStart(file), type.getEnd(), type.typeName.getText(file),
                            type, type.typeArguments?.[0], initializer,
                            node => checker.getTypeAtLocation(node), describeType
                        ));
                    }
                }
            }
            return assignments;
        }
    };
}
