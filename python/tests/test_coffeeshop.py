from typechat import python_type_to_typescript_schema
from tests.coffeeshop import Cart

def test_python_to_typescript_schema():
    result = python_type_to_typescript_schema(Cart)
    assert result is not None
    assert result.typescript_type_reference == "Cart"
    assert result.typescript_schema_str is not None
    assert not result.errors
