from typing import Any, TypedDict, cast

from typechat import python_type_to_typescript_schema
from .utilities import PyVersionedTypeScriptSchemaSnapshotExtension


def a():
    class C(TypedDict):
        my_attr_1: str
    return C


def b():
    class C(TypedDict):
        my_attr_2: int
    return C

A = a()
B = b()

class Derived(A, B): # type: ignore
    pass

def test_conflicting_names_1(snapshot: Any):
    assert python_type_to_typescript_schema(cast(type, Derived)) == snapshot(extension_class=PyVersionedTypeScriptSchemaSnapshotExtension)
