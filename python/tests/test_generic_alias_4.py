from typing import Any
from .utilities import check_snapshot_for_module_string_if_3_12_plus

module_str = """
from typing import Literal, TypedDict
class First[T](TypedDict):
    kind: Literal["first"]
    first_attr: T


class Second[T](TypedDict):
    kind: Literal["second"]
    second_attr: T


type FirstOrSecond[T] = First[T] | Second[T]

class Nested(TypedDict):
    item: FirstOrSecond[str]
"""

def test_generic_alias4(snapshot: Any):
    check_snapshot_for_module_string_if_3_12_plus(snapshot, input_type_str="Nested", module_str=module_str)
