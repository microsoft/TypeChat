import { SymbolFlags, TypeFormatFlags, type Project, type Type } from "typescript/sync";
import type { Node } from "typescript/ast";
import { isEnumDeclaration, isIdentifier, isTypeAliasDeclaration, isTypeReferenceNode, isVariableStatement } from "typescript/ast/is";
import { error, success } from "../../../src/result.js";
import {
    collectEnumInfo, collectEnumTypeTexts, describeAssignment, jsonFileName, schemaFileName,
    type CompilerAssignment, type CompilerProject, type CompilerTypeDescription
} from "../../../src/ts/compiler.js";

export function projectView({ program, checker }: Project): CompilerProject {
    function describeType(type: Type): CompilerTypeDescription {
        return {
            text: checker.typeToString(type, undefined, TypeFormatFlags.NoTruncation),
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
                        : success(members.map(member => checker.typeToString(member, undefined, TypeFormatFlags.NoTruncation)));
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
