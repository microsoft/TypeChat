from __future__ import annotations

import collections.abc
from dataclasses import dataclass
from types import NoneType, UnionType, get_original_bases
from typing import (
    Annotated,
    Any,
    ClassVar,
    Final,
    Generic,
    Literal,
    LiteralString,
    Never,
    NoReturn,
    NotRequired,
    Protocol,
    Required,
    Self,
    TypeAlias,
    TypeAliasType,
    TypedDict,
    TypeGuard,
    TypeVar,
    Union,
    cast,
    get_args,
    get_origin,
    get_type_hints,
    is_typeddict,
)

from typechat._internal.ts_conversion.ts_type_nodes import (
    AnyTypeReferenceNode,
    ArrayTypeNode,
    BooleanTypeReferenceNode,
    IdentifierNode,
    IndexSignatureDeclarationNode,
    InterfaceDeclarationNode,
    LiteralTypeNode,
    NeverTypeReferenceNode,
    NullTypeReferenceNode,
    NumberTypeReferenceNode,
    PropertyDeclarationNode,
    StringTypeReferenceNode,
    ThisTypeReferenceNode,
    TopLevelDeclarationNode,
    TypeAliasDeclarationNode,
    TypeNode,
    TypeParameterDeclarationNode,
    TypeReferenceNode,
    UnionTypeNode,
)


class GenericAliasish(Protocol):
    __origin__: type
    __args__: tuple[type, ...]


# type[TypedDict]
# https://github.com/microsoft/pyright/pull/6505#issuecomment-1834431725
class TypeOfTypedDict(Protocol):
    __total__: bool


def is_generic(py_type: object) -> TypeGuard[GenericAliasish]:
    return hasattr(py_type, "__origin__") and hasattr(py_type, "__args__")


TypeReferenceTarget: TypeAlias = type | TypeAliasType | TypeVar | GenericAliasish


def is_python_type_or_alias(origin: object) -> TypeGuard[type | TypeAliasType]:
    return isinstance(origin, TypeAliasType | type)


_KNOWN_GENERIC_SPECIAL_FORMS: frozenset[Any] = frozenset(
    [
        Required,
        NotRequired,
        ClassVar,
        Final,
        Annotated,
        Generic,
    ]
)

_KNOWN_SPECIAL_BASES: frozenset[Any] = frozenset([TypedDict, Protocol])


@dataclass
class TypeScriptNodeTranslationResult:
    type_declarations: list[TopLevelDeclarationNode]
    errors: list[str]


_LIST_TYPES: set[object] = {
    list,
    set,
    frozenset,
    collections.abc.Sequence,
    collections.abc.MutableSequence,
    collections.abc.Set,
    collections.abc.MutableSet,
    collections.abc.Iterable,
    collections.abc.Collection,
}


_DICT_TYPES: set[type] = {
    dict,
    collections.abc.MutableMapping,
    collections.abc.Mapping,
}


def python_type_to_typescript_nodes(root_py_type: object) -> TypeScriptNodeTranslationResult:
    # TODO: handle conflicting names

    declared_types: dict[object, TopLevelDeclarationNode | None] = {}
    undeclared_types = {root_py_type}
    errors: list[str] = []

    def skip_annotations(py_type: object) -> object:
        origin = py_type
        while (origin := get_origin(py_type)) and origin in _KNOWN_GENERIC_SPECIAL_FORMS:
            type_arguments = get_args(py_type)
            if not type_arguments:
                errors.append(f"'{origin}' has been used without any type arguments.")
                return Any
            py_type = type_arguments[0]
            continue
        return py_type

    def convert_to_type_reference_node(py_type: TypeReferenceTarget) -> TypeNode:
        py_type_to_declare = py_type

        if is_generic(py_type):
            py_type_to_declare = get_origin(py_type)

        if py_type_to_declare not in declared_types:
            if is_python_type_or_alias(py_type_to_declare):
                undeclared_types.add(py_type_to_declare)
            elif not isinstance(py_type, TypeVar):
                errors.append(f"Invalid usage of '{py_type}' as a type annotation.")
                return AnyTypeReferenceNode

        if is_generic(py_type):
            return generic_alias_to_type_reference(py_type)

        return TypeReferenceNode(IdentifierNode(py_type.__name__))

    def generic_alias_to_type_reference(py_type: GenericAliasish) -> TypeReferenceNode:
        origin = get_origin(py_type)
        assert origin is not None
        name = origin.__name__
        type_arguments = list(map(convert_to_type_node, get_args(py_type)))
        return TypeReferenceNode(IdentifierNode(name), type_arguments)

    def convert_literal_type_arg_to_type_node(py_type: object) -> TypeNode:
        py_type = skip_annotations(py_type)
        match py_type:
            case str() | int() | float():  # no need to match bool, it's a subclass of int
                return LiteralTypeNode(py_type)
            case None:
                return NullTypeReferenceNode
            case _:
                errors.append(f"'{py_type}' cannot be used as a literal type.")
                return AnyTypeReferenceNode

    def convert_to_type_node(py_type: object) -> TypeNode:
        py_type = skip_annotations(py_type)

        if py_type is str or py_type is LiteralString:
            return StringTypeReferenceNode
        if py_type is int or py_type is float:
            return NumberTypeReferenceNode
        if py_type is bool:
            return BooleanTypeReferenceNode
        if py_type is Any or py_type is object:
            return AnyTypeReferenceNode
        if py_type is None or py_type is NoneType:
            return NullTypeReferenceNode
        if py_type is Never or py_type is NoReturn:
            return NeverTypeReferenceNode
        if py_type is Self:
            return ThisTypeReferenceNode

        # TODO: consider handling bare 'tuple' (and list, etc.)
        # https://docs.python.org/3/library/typing.html#annotating-tuples
        # Using plain 'tuple' as an annotation is equivalent to using 'tuple[Any, ...]':

        origin = get_origin(py_type)
        if origin is not None:
            if origin in _LIST_TYPES:
                (type_arg,) = get_type_argument_nodes(py_type, 1, AnyTypeReferenceNode)
                if isinstance(type_arg, UnionTypeNode):
                    return TypeReferenceNode(IdentifierNode("Array"), [type_arg])
                return ArrayTypeNode(type_arg)

            if origin in _DICT_TYPES:
                # TODO
                # Currently, we naively assume all dicts are string-keyed
                # unless they're annotated with `int` or `float` (note: not `int | float`).
                key_type_arg, value_type_arg = get_type_argument_nodes(py_type, 2, AnyTypeReferenceNode)
                if key_type_arg is not NumberTypeReferenceNode:
                    key_type_arg = StringTypeReferenceNode
                return TypeReferenceNode(IdentifierNode("Record"), [key_type_arg, value_type_arg])

            # TODO: tuple

            if origin is Union or origin is UnionType:
                type_node = [convert_to_type_node(py_type_arg) for py_type_arg in get_args(py_type)]
                assert len(type_node) > 1
                return UnionTypeNode(type_node)

            if origin is Literal:
                type_node = [convert_literal_type_arg_to_type_node(py_type_arg) for py_type_arg in get_args(py_type)]
                assert len(type_node) >= 1
                return UnionTypeNode(type_node)

            assert is_generic(py_type)
            return convert_to_type_reference_node(py_type)

        if is_python_type_or_alias(py_type):
            return convert_to_type_reference_node(py_type)

        if isinstance(py_type, TypeVar):
            return convert_to_type_reference_node(py_type)

        errors.append(f"'{py_type}' cannot be used as a type annotation.")
        return AnyTypeReferenceNode

    def declare_property(name: str, py_annotation: type | TypeAliasType, optional: bool):
        origin: object = py_annotation
        comments: str = ""
        while origin := get_origin(origin):
            if origin is Annotated and hasattr(py_annotation, "__metadata__"):
                comments = py_annotation.__metadata__[0]
            elif origin in _KNOWN_GENERIC_SPECIAL_FORMS:
                nested = get_args(py_annotation)
                if nested:
                    nested_origin = get_origin(nested[0])
                    if nested_origin is Annotated:
                        comments = nested[0].__metadata__[0]
            if origin is Required:
                optional = False
                break
            if origin is NotRequired:
                optional = True
                break
        type_annotation = convert_to_type_node(skip_annotations(py_annotation))
        return PropertyDeclarationNode(name, optional, comments, type_annotation)

    def declare_type(py_type: object):
        if is_typeddict(py_type):
            assert isinstance(py_type, type)
            type_params = [TypeParameterDeclarationNode(type_param.__name__) for type_param in py_type.__type_params__]
            annotated_members = get_type_hints(py_type, include_extras=True)
            assume_optional = cast(TypeOfTypedDict, py_type).__total__ is False
            raw_but_filtered_bases: list[type] = [
                base
                for base in get_original_bases(py_type)
                if base not in _KNOWN_SPECIAL_BASES and get_origin(base) not in _KNOWN_GENERIC_SPECIAL_FORMS
            ]
            base_properties: dict[str, set[object]] = {}
            for base in raw_but_filtered_bases:
                for prop, annotation in get_type_hints(get_origin(base) or base, include_extras=True).items():
                    base_properties.setdefault(prop, set()).add(annotation)
            properties: list[PropertyDeclarationNode | IndexSignatureDeclarationNode] = [
                declare_property(name, annotation, assume_optional)
                for name, annotation in annotated_members.items()
                # Only keep these in if they're unique or
                if name not in base_properties or
                # all bases declare them differently
                len(base_properties[name]) > 1 or
                # or the current type declares them differently
                annotation not in base_properties[name]
            ]
            bases = [convert_to_type_node(base) for base in raw_but_filtered_bases]
            return InterfaceDeclarationNode(py_type.__name__, type_params, py_type.__doc__ or "", bases, properties)
        if isinstance(py_type, type):
            # TODO: Everything
            errors.append("Currently only TypedDict and type alias declarations are supported")
            return InterfaceDeclarationNode(py_type.__name__, None, f"Comment for {py_type.__name__}.", None, [])
        if isinstance(py_type, TypeAliasType):
            type_params = [TypeParameterDeclarationNode(type_param.__name__) for type_param in py_type.__type_params__]

            return TypeAliasDeclarationNode(
                py_type.__name__,
                type_params,
                f"Comment for {py_type.__name__}.",
                convert_to_type_node(py_type.__value__),
            )

        raise RuntimeError(f"Cannot declare type {py_type}.")

    def get_type_argument_nodes(py_type: object, count: int, default: TypeNode) -> list[TypeNode]:
        py_type_args = get_args(py_type)
        result: list[TypeNode] = []
        if len(py_type_args) != count:
            errors.append(f"Expected '{count}' type arguments for '{py_type}'.")
        for i in range(count):
            if i < len(py_type_args):
                type_node = convert_to_type_node(py_type_args[i])
            else:
                type_node = default
            result.append(type_node)
        return result

    while undeclared_types:
        py_type = undeclared_types.pop()
        declared_types[py_type] = None
        declared_types[py_type] = declare_type(py_type)

    type_declarations = cast(list[TopLevelDeclarationNode], list(declared_types.values()))
    assert None not in type_declarations

    return TypeScriptNodeTranslationResult(type_declarations, errors)
