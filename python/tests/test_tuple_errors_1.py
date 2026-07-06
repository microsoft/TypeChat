
from dataclasses import dataclass
from typing import Any

from typechat import python_type_to_typescript_schema
from .utilities import TypeScriptSchemaSnapshotExtension

@dataclass
class TupleContainer:
    empty_tuples_args_1: tuple[(), ()] # type: ignore
    empty_tuples_args_2: tuple[(), ...] # type: ignore

    # Arbitrary-length tuples have exactly two type arguments – the type and an ellipsis.
    # Any other tuple form that uses an ellipsis is invalid.
    arbitrary_length_1: tuple[...] # type: ignore
    arbitrary_length_2: tuple[int, int, ...] # type: ignore
    arbitrary_length_3: tuple[..., int] # type: ignore
    arbitrary_length_4: tuple[..., ...] # type: ignore
    arbitrary_length_5: tuple[int, ..., int] # type: ignore
    arbitrary_length_6: tuple[int, ..., int, ...] # type: ignore

def test_tuples_2(snapshot: Any):
    assert python_type_to_typescript_schema(TupleContainer) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)