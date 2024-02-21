from typechat import python_type_to_typescript_schema
from tests.hello_dataclasses import Response

def test_generic_alias1():
    result = python_type_to_typescript_schema(Response)
    assert result is not None
    assert result.typescript_type_reference == "Response"
    assert result.typescript_schema_str is not None
    assert not result.errors