<<<<<<< HEAD
from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.generic_alias_1 import FirstOrSecond

def test_generic_alias1(snapshot : Any):
    assert(python_type_to_typescript_schema(FirstOrSecond) == snapshot)
=======
from typechat import python_type_to_typescript_schema
from tests.generic_alias_1 import FirstOrSecond

def test_generic_alias1():
    result = python_type_to_typescript_schema(FirstOrSecond)
    assert result is not None
    assert result.typescript_type_reference == "FirstOrSecond"
    assert result.typescript_schema_str is not None
    assert not result.errors
>>>>>>> refs/remotes/origin/create-pytests
