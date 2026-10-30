from dataclasses import dataclass, make_dataclass
import inspect
from textwrap import dedent
from typing import Annotated, Literal

import pytest
from typing_extensions import Any, TypedDict, Doc

from typechat import python_type_to_typescript_schema
from .utilities import TypeScriptSchemaSnapshotExtension


class Point(TypedDict):
    x: int  # X-coordinate
    y: int  # Y-coordinate


class Mixed(TypedDict):
    labeled: Annotated[str, Doc("from Doc")]  # inline comment (Doc takes priority)
    plain: str  # just an inline comment
    silent: float


@dataclass
class Box:
    width: float  # width in pixels
    height: float  # height in pixels
    label: str = ""


class Theme(TypedDict):
    background: Literal["#FFFFFF", "#000000"]
    accent: Literal["#FF0000"]


class Swatch(TypedDict):
    color: Literal["#00FF00"]  # the accent color as a hex triplet


@dataclass
class GitConfig:
    comment_marker: str = "value # not a comment"


@dataclass
class ApiEndpoint:
    url: str = "https://api.example.com/v1/items#latest"


class ButtonSpec(TypedDict):
    variant: Literal[
        "primary",
        "hash-#-danger"]  # pick one variant


class ExplicitDocumentation(TypedDict):
    empty_doc: Annotated[int, Doc("")]  # not the documentation
    legacy: Annotated[int, "explicit documentation"]  # not the documentation
    empty_legacy: Annotated[int, ""]  # not the documentation


@dataclass
class Outer:
    value: int  # outer field
    plain: str

    @dataclass
    class Inner:
        value: int  # inner field
        plain: str  # inner only


DynamicPoint = TypedDict("DynamicPoint", {"value": Annotated[int, Doc("explicit documentation")]})
DynamicBox = make_dataclass("DynamicBox", [("value", Annotated[int, Doc("explicit documentation")])])


def assert_schema(py_type: type, expected: str) -> None:
    result = python_type_to_typescript_schema(py_type)
    assert result.errors == []
    assert result.typescript_schema_str == dedent(expected).lstrip()


def test_typeddict_inline_comments(snapshot: Any):
    assert python_type_to_typescript_schema(Point) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)


def test_doc_takes_priority_over_inline(snapshot: Any):
    assert python_type_to_typescript_schema(Mixed) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)


def test_dataclass_inline_comments(snapshot: Any):
    assert python_type_to_typescript_schema(Box) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)


@pytest.mark.parametrize(("py_type", "expected"), [
    (Theme, """
        interface Theme {
            background: "#FFFFFF" | "#000000";
            accent: "#FF0000";
        }
    """),
    (Swatch, """
        interface Swatch {
            // the accent color as a hex triplet
            color: "#00FF00";
        }
    """),
    (GitConfig, """
        interface GitConfig {
            comment_marker?: string;
        }
    """),
    (ApiEndpoint, """
        interface ApiEndpoint {
            url?: string;
        }
    """),
    (ButtonSpec, """
        interface ButtonSpec {
            // pick one variant
            variant: "primary" | "hash-#-danger";
        }
    """),
])
def test_hashes_in_types_and_defaults_are_not_comments(py_type: type, expected: str):
    assert_schema(py_type, expected)


def test_explicit_documentation_takes_precedence_even_when_empty():
    assert_schema(ExplicitDocumentation, """
        interface ExplicitDocumentation {
            empty_doc: number;
            // explicit documentation
            legacy: number;
            empty_legacy: number;
        }
    """)


def test_nested_class_comments_do_not_leak_into_the_outer_class():
    assert_schema(Outer, """
        interface Outer {
            // outer field
            value: number;
            plain: string;
        }
    """)


def test_nested_classes_can_be_translated_independently():
    assert_schema(Outer.Inner, """
        interface Inner {
            // inner field
            value: number;
            // inner only
            plain: string;
        }
    """)


@pytest.mark.parametrize("error_type", [OSError, TypeError])
def test_unavailable_source_preserves_types_and_explicit_documentation(
    monkeypatch: pytest.MonkeyPatch,
    error_type: type[Exception],
):
    def unavailable(_obj: object) -> tuple[list[str], int]:
        raise error_type("source unavailable")

    monkeypatch.setattr(inspect, "getsourcelines", unavailable)
    assert_schema(Mixed, """
        interface Mixed {
            // from Doc
            labeled: string;
            plain: string;
            silent: number;
        }
    """)


@pytest.mark.parametrize("py_type", [DynamicPoint, DynamicBox])
def test_dynamically_created_types_remain_supported(py_type: type):
    assert_schema(py_type, f"""
        interface {py_type.__name__} {{
            // explicit documentation
            value: number;
        }}
    """)


def test_unexpected_source_lookup_failures_are_not_silenced(monkeypatch: pytest.MonkeyPatch):
    def broken(_obj: object) -> tuple[list[str], int]:
        raise RuntimeError("broken source lookup")

    monkeypatch.setattr(inspect, "getsourcelines", broken)
    with pytest.raises(RuntimeError, match="broken source lookup"):
        python_type_to_typescript_schema(Point)


@pytest.mark.parametrize("source", [
    "class Point(TypedDict):\n    x: Literal[\n",
    "value = 1\n",
])
def test_invalid_source_is_reported_as_a_conversion_error(monkeypatch: pytest.MonkeyPatch, source: str):
    def get_source(_obj: object) -> tuple[list[str], int]:
        return source.splitlines(keepends=True), 1

    monkeypatch.setattr(inspect, "getsourcelines", get_source)
    result = python_type_to_typescript_schema(Point)
    assert len(result.errors) == 1
    assert result.errors[0].startswith("Cannot extract inline field comments for Point:")


@pytest.mark.parametrize(("source", "expected"), [
    ("""
        class Point(TypedDict):
            x: int; y: int  # second field only
    """, """
        interface Point {
            x: number;
            // second field only
            y: number;
        }
    """),
    ("""
        class Point(TypedDict):
            x: int;  # first field
            # not documentation for y
            y: int
    """, """
        interface Point {
            // first field
            x: number;
            y: number;
        }
    """),
    ("""
        class Point(TypedDict):
            x: Literal["\u00e9"]  # first field
            y: int
    """, """
        interface Point {
            // first field
            x: number;
            y: number;
        }
    """),
    ("""
        class Point(TypedDict):
            x: Literal["line\u2028separator"]  # first field
            y: int  # second field
    """, """
        interface Point {
            // first field
            x: number;
            // second field
            y: number;
        }
    """),
    ("""
        class Point(TypedDict):
            x: int  # type: ignore
            y: int  #type:ignore[assignment, attr-defined]  # explanation
    """, """
        interface Point {
            x: number;
            y: number;
        }
    """),
    ("""
        class Point(TypedDict):
            x: Literal["# type: ignore"]  # first field
            y: int  # type: ignored is ordinary documentation
    """, """
        interface Point {
            // first field
            x: number;
            // type: ignored is ordinary documentation
            y: number;
        }
    """),
])
def test_only_trailing_field_comments_are_attached(
    monkeypatch: pytest.MonkeyPatch,
    source: str,
    expected: str,
):
    def get_source(_obj: object) -> tuple[list[str], int]:
        return dedent(source).lstrip().splitlines(keepends=True), 1

    monkeypatch.setattr(inspect, "getsourcelines", get_source)
    assert_schema(Point, expected)


def test_inline_comments_do_not_hide_unsupported_schema_types():
    class Invalid(TypedDict):
        value: complex  # documentation does not make this type supported

    result = python_type_to_typescript_schema(Invalid)
    assert any("complex" in error and "cannot be translated" in error for error in result.errors)
