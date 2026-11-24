import { SymbolFlags, TypeFormatFlags, type Project, type Type } from "typescript/sync";
import type { EnumMember, Node } from "typescript/ast";
import { isEnumDeclaration, isTypeReferenceNode, isVariableStatement } from "typescript/ast/is";
import {
    collectStringEnumValues, describeAssignment, jsonFileName, schemaFileName,
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
        getStringEnumValues() {
            const source = program.getSourceFile(schemaFileName);
            return source ? collectStringEnumValues<Node, EnumMember>(
                source,
                (node, visit) => node.forEachChild(visit),
                node => isEnumDeclaration(node) ? node.members : [],
                member => checker.getConstantValue(member)
            ) : [];
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
