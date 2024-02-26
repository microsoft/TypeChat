from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.coffeeshop import Cart

def test_python_to_typescript_schema(snapshot: Any):
    assert(python_type_to_typescript_schema(Cart) == snapshot)
