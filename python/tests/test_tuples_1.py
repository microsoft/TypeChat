
from dataclasses import dataclass
from typing import Any

from typechat import python_type_to_typescript_schema
from .utilities import TypeScriptSchemaSnapshotExtension

@dataclass
class TupleContainer:
    # The empty tuple can be annotated as tuple[()].
    empty_tuple: tuple[()]

    tuple_1: tuple[int]
    tuple_2: tuple[int, str]
    tuple_3: tuple[int, str] | tuple[float, str]


    # Arbitrary-length homogeneous tuples can be expressed using one type and an ellipsis, for example tuple[int, ...].
    arbitrary_length_1: tuple[int, ...]
    arbitrary_length_2: tuple[int, ...] | list[int]
    arbitrary_length_3: tuple[int, ...] | tuple[int, ...]
    arbitrary_length_4: tuple[int, ...] | tuple[float, ...]
    arbitrary_length_5: tuple[int, ...] | tuple[int]
    arbitrary_length_6: tuple[int, ...] | tuple[int] | tuple[int, int]

def test_tuples_1(snapshot: Any):
    assert python_type_to_typescript_schema(TupleContainer) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)