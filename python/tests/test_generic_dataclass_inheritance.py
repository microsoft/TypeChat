from dataclasses import dataclass
from typing import Annotated, Any, Generic, TypeVar

import pytest

from typechat import python_type_to_typescript_schema

T = TypeVar("T")
U = TypeVar("U")
K = TypeVar("K")
V = TypeVar("V")


@dataclass
class Box(Generic[T]):
    name: str
    item: T
    others: list[T] | None = None
    described: Annotated[T | None, "Has a comment."] = None


@dataclass
class IntBox(Box[int]):
    extra: str = "fake"


@dataclass
class IntBoxChild(IntBox):
    more: str = "fake"


@dataclass
class ListBox(Box[list[U]], Generic[U]):
    own: U | None = None


@dataclass
class StrListBox(ListBox[str]):
    pass


@dataclass
class SameNameBox(Box[list[T]], Generic[T]):
    own: T | None = None


@dataclass
class Pair(Generic[K, V]):
    key: K
    value: V


@dataclass
class SwappedPair(Pair[V, K], Generic[K, V]):
    pass


@dataclass
class OverridingBox(Box[int]):
    item: str = "fake"  # type: ignore


def interface_body(target: type[Any]) -> str:
    result = python_type_to_typescript_schema(target)
    assert not result.errors
    schema = result.typescript_schema_str
    start = schema.index(f"interface {target.__name__}")
    return schema[start : schema.index("}\n", start)]


@pytest.mark.parametrize("target", [IntBox, IntBoxChild])
def test_inherited_fields_use_the_type_arguments_of_the_base(target: type[Any]) -> None:
    body = interface_body(target)
    assert "    item: number;\n" in body
    assert "    others?: number[] | null;\n" in body
    assert "    // Has a comment.\n    described?: number | null;\n" in body


def test_generic_base_is_unchanged() -> None:
    body = interface_body(Box)
    assert body.startswith("interface Box<T> {\n")
    assert "    item: T;\n" in body
    assert "    others?: T[] | null;\n" in body


def test_type_arguments_are_followed_through_generic_subclasses() -> None:
    body = interface_body(ListBox)
    assert body.startswith("interface ListBox<U> extends Box<U[]> {\n")
    assert "    item: U[];\n" in body
    assert "    own?: U | null;\n" in body

    body = interface_body(StrListBox)
    assert "    item: string[];\n" in body
    assert "    others?: string[][] | null;\n" in body
    assert "    own?: string | null;\n" in body


def test_subclass_can_reuse_the_type_parameter_of_its_base() -> None:
    body = interface_body(SameNameBox)
    assert "    item: T[];\n" in body
    assert "    own?: T | null;\n" in body


def test_type_arguments_are_matched_by_position() -> None:
    body = interface_body(SwappedPair)
    assert body.startswith("interface SwappedPair<K, V> extends Pair<V, K> {\n")
    assert "    key: V;\n" in body
    assert "    value: K;\n" in body


def test_overridden_field_keeps_its_own_type() -> None:
    assert "    item?: string;\n" in interface_body(OverridingBox)
