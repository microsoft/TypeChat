from typing import Any
from typechat import python_type_to_typescript_schema
from .utilities import check_snapshot_for_module_string_if_3_12_plus

module_str = "type StrOrInt = str | int"

def test_type_alias_union1(snapshot: Any):
    check_snapshot_for_module_string_if_3_12_plus(snapshot, "StrOrInt", module_str)
