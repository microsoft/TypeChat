from __future__ import annotations

from collections import OrderedDict
import inspect
import typing
import typing_extensions
from dataclasses import MISSING, Field, dataclass
from types import NoneType, UnionType
from typing_extensions import (
    Annotated,
    Any,
    ClassVar,
    Doc,
    Final,
    Generic,
    Literal,
    LiteralString,
    Never,
    NoReturn,
    NotRequired,
    Protocol,
    Required,
    TypeAlias,
    TypeAliasType,    
    TypeGuard,
    TypeVar,
    Union,
    cast,
    get_args,
    get_origin,
    get_original_bases,
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

class GenericDeclarationish(Protocol):
    __parameters__: list[TypeVar]
    __type_params__: list[TypeVar] # NOTE: may not be present unless running in 3.12

class GenericAliasish(Protocol):
    __origin__: object
    __args__: tuple[object, ...]
    __name__: str


class Annotatedish(Protocol):
    # NOTE: `__origin__` here refers to `SomeType` in `Annnotated[SomeType, ...]`
    __origin__: object
    __metadata__: tuple[object, ...]

class Dataclassish(Protocol):
    __dataclass_fields__: dict[str, Field[Any]]

# type[TypedDict]
# https://github.com/microsoft/pyright/pull/6505#issuecomment-1834431725
class TypeOfTypedDict(Protocol):
    __total__: bool


def is_generic(py_type: object) -> TypeGuard[GenericAliasish]:
    return hasattr(py_type, "__origin__") and hasattr(py_type, "__args__")

def is_dataclass(py_type: object) -> TypeGuard[Dataclassish]:
    return hasattr(py_type, "__dataclass_fields__") and isinstance(cast(Any, py_type).__dataclass_fields__, dict)

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

_KNOWN_SPECIAL_BASES: frozenset[Any] = frozenset([typing.TypedDict, typing_extensions.TypedDict, Protocol])


@dataclass
class TypeScriptNodeTranslationResult:
    type_declarations: list[TopLevelDeclarationNode]
    errors: list[str]


# TODO: https://github.com/microsoft/pyright/issues/6587
_SELF_TYPE = getattr(typing_extensions, "Self")

_LIST_TYPES: set[object] = {
    list,
    set,
    frozenset,
    # TODO: https://github.com/microsoft/pyright/issues/6582
    # collections.abc.MutableSequence,
    # collections.abc.Sequence,
    # collections.abc.Set
}

# TODO: https://github.com/microsoft/pyright/issues/6582
# _DICT_TYPES: set[type] = {
#     dict,
#     collections.abc.MutableMapping,
#     collections.abc.Mapping
# }


def python_type_to_typescript_nodes(root_py_type: object) -> TypeScriptNodeTranslationResult:
    # TODO: handle conflicting names

    declared_types: OrderedDict[object, TopLevelDeclarationNode | None] = OrderedDict()
    undeclared_types: OrderedDict[object, object] = OrderedDict({root_py_type: root_py_type}) # just a set, really
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
                undeclared_types[py_type_to_declare] = py_type_to_declare
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
        if py_type is _SELF_TYPE:
            return ThisTypeReferenceNode

        # TODO: consider handling bare 'tuple' (and list, etc.)
        # https://docs.python.org/3/library/typing.html#annotating-tuples
        # Using plain tuple as an annotation is equivalent to using tuple[Any, ...]:

        origin = get_origin(py_type)
        if origin is not None:
            if origin in _LIST_TYPES:
                (type_arg,) = get_type_argument_nodes(py_type, 1, AnyTypeReferenceNode)
                if isinstance(type_arg, UnionTypeNode):
                    return TypeReferenceNode(IdentifierNode("Array"), [type_arg])
                return ArrayTypeNode(type_arg)

            if origin is dict:
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

    def declare_property(name: str, py_annotation: type | TypeAliasType, is_typeddict_attribute: bool, optionality_default: bool):
        """
        Declare a property for a given type.
        If 'optionality_default' is 
        """
        current_annotation: object = py_annotation
        origin: object
        optional: bool | None = None
        comment: str | None = None
        while origin := get_origin(current_annotation):
            if origin is Annotated and comment is None:
                current_annotation = cast(Annotatedish, current_annotation)

                for metadata in current_annotation.__metadata__:
                    if isinstance(metadata, Doc):
                        comment = metadata.documentation
                        break
                    if isinstance(metadata, str):
                        comment = metadata
                        break

                current_annotation = current_annotation.__origin__

            elif origin is Required or origin is NotRequired:
                if not is_typeddict_attribute:
                    errors.append(f"Optionality cannot be specified with {origin} outside of TypedDicts.")

                if optional is None:
                    optional = origin is NotRequired
                else:
                    errors.append(f"{origin} cannot be used within another optionality annotation.")

                current_annotation = get_args(current_annotation)[0]
            else:
                break

        if optional is None:
            optional = optionality_default

        type_annotation = convert_to_type_node(skip_annotations(current_annotation))
        return PropertyDeclarationNode(name, optional, comment or "", type_annotation)

    def declare_type(py_type: object):
        if (is_typeddict(py_type) or is_dataclass(py_type)) and isinstance(py_type, type):
            comment = py_type.__doc__ or ""

            if hasattr(py_type, "__type_params__"):
                type_params = [
                    TypeParameterDeclarationNode(type_param.__name__)
                    for type_param in cast(GenericDeclarationish, py_type).__type_params__
                ]
            elif hasattr(py_type, "__parameters__"):
                type_params = [
                    TypeParameterDeclarationNode(type_param.__name__)
                    for type_param in cast(GenericDeclarationish, py_type).__parameters__
                ]
            else:
                type_params = None

            annotated_members = get_type_hints(py_type, include_extras=True)

            raw_but_filtered_bases: list[type] = [
                base
                for base in get_original_bases(py_type)
                if not(base is object or base in _KNOWN_SPECIAL_BASES or get_origin(base) in _KNOWN_GENERIC_SPECIAL_FORMS)
            ]
            base_attributes: OrderedDict[str, set[object]] = OrderedDict()
            for base in raw_but_filtered_bases:
                for prop, type_hint in get_type_hints(get_origin(base) or base, include_extras=True).items():
                    base_attributes.setdefault(prop, set()).add(type_hint)
            bases = [convert_to_type_node(base) for base in raw_but_filtered_bases]

            properties: list[PropertyDeclarationNode | IndexSignatureDeclarationNode] = []
            if is_typeddict(py_type):
                for attr_name, type_hint in annotated_members.items():
                    if attribute_identical_in_all_bases(attr_name, type_hint, base_attributes):
                        continue

                    assume_optional = cast(TypeOfTypedDict, py_type).__total__ is False
                    prop = declare_property(attr_name, type_hint, is_typeddict_attribute=True, optionality_default=assume_optional)
                    properties.append(prop)
            else:
                # When a dataclass is created with no explicit docstring, @dataclass will
                # generate one for us; however, we don't want these in the default output.
                cleaned_signature = str(inspect.signature(py_type)).replace(" -> None", "")
                dataclass_doc = f"{py_type.__name__}{cleaned_signature}"
                if comment == dataclass_doc:
                    comment = ""

                for attr_name, field in cast(Dataclassish, py_type).__dataclass_fields__.items():
                    type_hint = annotated_members[attr_name]
                    optional = not(field.default is MISSING and field.default_factory is MISSING)
                    prop = declare_property(attr_name, type_hint, is_typeddict_attribute=False, optionality_default=optional)
                    properties.append(prop)

            return InterfaceDeclarationNode(py_type.__name__, type_params, comment, bases, properties)
        if isinstance(py_type, type):
            errors.append("Currently only TypedDict, dataclass, and type alias declarations are supported in TypeChat.")
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

    def attribute_identical_in_all_bases(attr_name: str, type_hint: object, base_attributes: dict[str, set[object]]) -> bool:
        """
        We typically want to omit attributes with type hints that are
        identical to those declared in all base types.
        """
        return attr_name in base_attributes and len(base_attributes[attr_name]) == 1 and type_hint in base_attributes[attr_name]

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
        py_type = undeclared_types.popitem()[0]
        declared_types[py_type] = None
        declared_types[py_type] = declare_type(py_type)

    type_declarations = cast(list[TopLevelDeclarationNode], list(declared_types.values()))
    assert None not in type_declarations

    return TypeScriptNodeTranslationResult(type_declarations, errors)
