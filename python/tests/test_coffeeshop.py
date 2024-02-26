<<<<<<< HEAD
from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.coffeeshop import Cart

def test_python_to_typescript_schema(snapshot: Any):
    assert(python_type_to_typescript_schema(Cart) == snapshot)
=======
from typechat import python_type_to_typescript_schema
from tests.coffeeshop import Cart

def test_python_to_typescript_schema():
    result = python_type_to_typescript_schema(Cart)
    assert result is not None
    assert result.typescript_type_reference == "Cart"
    assert result.typescript_schema_str is not None
    assert not result.errors
>>>>>>> refs/remotes/origin/create-pytests
