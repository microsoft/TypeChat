<<<<<<< HEAD
from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.hello_world import D_or_E

def test_generic_alias1(snapshot: Any):
    assert(python_type_to_typescript_schema(D_or_E) == snapshot)
=======
from typechat import python_type_to_typescript_schema
from tests.hello_world import D_or_E

def test_generic_alias1():
    result = python_type_to_typescript_schema(D_or_E)
    assert result is not None
    assert result.typescript_type_reference == "D_or_E"
    assert result.typescript_schema_str is not None
    assert not result.errors
>>>>>>> refs/remotes/origin/create-pytests
