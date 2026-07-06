from dataclasses import dataclass
from typing import Annotated
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


def test_typeddict_inline_comments(snapshot: Any):
    assert python_type_to_typescript_schema(Point) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)


def test_doc_takes_priority_over_inline(snapshot: Any):
    assert python_type_to_typescript_schema(Mixed) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)


def test_dataclass_inline_comments(snapshot: Any):
    assert python_type_to_typescript_schema(Box) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)
