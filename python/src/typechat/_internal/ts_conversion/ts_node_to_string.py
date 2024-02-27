import json
from typing_extensions import assert_never

from typechat._internal.ts_conversion.ts_type_nodes import (
    ArrayTypeNode,
    IdentifierNode,
    IndexSignatureDeclarationNode,
    InterfaceDeclarationNode,
    LiteralTypeNode,
    NullTypeReferenceNode,
    PropertyDeclarationNode,
    TopLevelDeclarationNode,
    TupleTypeNode,
    TypeAliasDeclarationNode,
    TypeNode,
    TypeReferenceNode,
    UnionTypeNode,
)


def comment_to_str(comment_text: str, indentation: str) -> str:
    comment_text = comment_text.strip()
    if not comment_text:
        return ""
    lines = [line.strip() for line in comment_text.splitlines()]

    return "\n".join([f"{indentation}// {line}" for line in lines]) + "\n"


def ts_type_to_str(type_node: TypeNode) -> str:
    match type_node:
        case TypeReferenceNode(name, type_arguments):
            assert isinstance(name, IdentifierNode)
            if type_arguments is None:
                return name.text
            return f"{name.text}<{', '.join([ts_type_to_str(arg) for arg in type_arguments])}>"
        case ArrayTypeNode(element_type):
            assert type(element_type) is not UnionTypeNode
            # if type(element_type) is UnionTypeNode:
            #     return f"Array<{ts_type_to_str(element_type)}>"
            return f"{ts_type_to_str(element_type)}[]"
        case TupleTypeNode(element_types):
            return f"[{', '.join([ts_type_to_str(element_type) for element_type in element_types])}]"
        case UnionTypeNode(types):
            # Remove duplicates, but try to preserve order of types,
            # and put null at the end if it's present.
            str_set: set[str] = set()
            type_strs: list[str] = []
            nullable = False
            for type_node in types:
                if type_node is NullTypeReferenceNode:
                    nullable = True
                    continue
                type_str = ts_type_to_str(type_node)
                if type_str not in str_set:
                    str_set.add(type_str)
                    type_strs.append(type_str)
            if nullable:
                type_strs.append("null")
            return " | ".join(type_strs)
        case LiteralTypeNode(value):
            return json.dumps(value)
        # case _:
        #     raise NotImplementedError(f"Unhandled type {type(type_node)}")
    assert_never(type_node)


def object_member_to_str(member: PropertyDeclarationNode | IndexSignatureDeclarationNode) -> str:
    match member:
        case PropertyDeclarationNode(name, is_optional, comment, annotation):
            comment = comment_to_str(comment, "    ")
            if not name.isalnum():
                name = json.dumps(name)
            return f"{comment}    {name}{'?' if is_optional else ''}: {ts_type_to_str(annotation)};"
        case IndexSignatureDeclarationNode(key_type, value_type):
            return f"[key: {ts_type_to_str(key_type)}]: {ts_type_to_str(value_type)};"
        # case _:
        #     raise NotImplementedError(f"Unhandled member type {type(member)}")
    assert_never(member)


def ts_declaration_to_str(declaration: TopLevelDeclarationNode) -> str:
    match declaration:
        case InterfaceDeclarationNode(name, type_parameters, comment, base_types, members):
            comment = comment_to_str(comment, "")
            type_param_str = f"<{', '.join([param.name for param in type_parameters])}>" if type_parameters else ""
            base_type_str = (
                f" extends {', '.join([ts_type_to_str(base_type) for base_type in base_types])}" if base_types else ""
            )
            members_str = "\n".join([f"{object_member_to_str(member)}" for member in members]) + "\n" if members else ""
            return f"{comment}interface {name}{type_param_str}{base_type_str} {{\n{members_str}}}\n"
        case TypeAliasDeclarationNode(name, type_parameters, comment, target):
            type_param_str = f"<{', '.join([param.name for param in type_parameters])}>" if type_parameters else ""
            return f"type {name}{type_param_str} = {ts_type_to_str(target)}\n"
        # case _:
        #     raise NotImplementedError(f"Unhandled declaration type {type(declaration)}")
    assert_never(declaration)
