<<<<<<< HEAD
from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.generic_alias_2 import Nested

def test_generic_alias1(snapshot : Any):
    assert(python_type_to_typescript_schema(Nested) == snapshot)
    
=======
from typechat import python_type_to_typescript_schema
from tests.generic_alias_2 import Nested

def test_generic_alias1():
    result = python_type_to_typescript_schema(Nested)
    assert result is not None
    assert result.typescript_type_reference == "Nested"
    assert result.typescript_schema_str is not None
    assert not result.errors
>>>>>>> refs/remotes/origin/create-pytests
