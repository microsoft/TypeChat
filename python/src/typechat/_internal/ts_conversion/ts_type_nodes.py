from __future__ import annotations

from dataclasses import dataclass
from typing_extensions import TypeAlias

TypeNode: TypeAlias = "TypeReferenceNode | UnionTypeNode | LiteralTypeNode | ArrayTypeNode"

@dataclass
class IdentifierNode:
    text: str

@dataclass
class QualifiedNameNode:
    left: QualifiedNameNode | IdentifierNode
    right: IdentifierNode

@dataclass
class TypeReferenceNode:
    name: QualifiedNameNode | IdentifierNode
    type_arguments: list[TypeNode] | None = None

@dataclass
class UnionTypeNode:
    types: list[TypeNode]

@dataclass
class LiteralTypeNode:
    value: str | int | float | bool

@dataclass
class ArrayTypeNode:
    element_type: TypeNode

@dataclass
class InterfaceDeclarationNode:
    name: str
    type_parameters: list[TypeParameterDeclarationNode] | None
    comment: str
    base_types: list[TypeNode] | None
    members: list[PropertyDeclarationNode | IndexSignatureDeclarationNode]

@dataclass
class TypeParameterDeclarationNode:
    name: str
    constraint: TypeNode | None = None

@dataclass
class PropertyDeclarationNode:
    name: str
    is_optional: bool
    comment: str
    type: TypeNode

@dataclass
class IndexSignatureDeclarationNode:
    key_type: TypeNode
    value_type: TypeNode

@dataclass
class TypeAliasDeclarationNode:
    name: str
    type_parameters: list[TypeParameterDeclarationNode] | None
    comment: str
    type: TypeNode

TopLevelDeclarationNode: TypeAlias = "InterfaceDeclarationNode | TypeAliasDeclarationNode"

StringTypeReferenceNode = TypeReferenceNode(IdentifierNode("string"))
NumberTypeReferenceNode = TypeReferenceNode(IdentifierNode("number"))
BooleanTypeReferenceNode = TypeReferenceNode(IdentifierNode("boolean"))
AnyTypeReferenceNode = TypeReferenceNode(IdentifierNode("any"))
NullTypeReferenceNode = TypeReferenceNode(IdentifierNode("null"))
NeverTypeReferenceNode = TypeReferenceNode(IdentifierNode("never"))
ThisTypeReferenceNode = TypeReferenceNode(IdentifierNode("this"))
