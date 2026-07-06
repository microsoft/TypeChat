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
"""

def test_generic_alias3(snapshot: Any):
    check_snapshot_for_module_string_if_3_12_plus(snapshot, input_type_str="FirstOrSecond", module_str=module_str)
