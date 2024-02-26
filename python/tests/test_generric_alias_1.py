from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.generic_alias_1 import FirstOrSecond

def test_generic_alias1(snapshot : Any):
    assert(python_type_to_typescript_schema(FirstOrSecond) == snapshot)
