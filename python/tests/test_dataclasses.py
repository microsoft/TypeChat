from typing_extensions import Any
from typechat import python_type_to_typescript_schema
from tests.hello_dataclasses import Response

def test_generic_alias1(snapshot: Any):
    assert(python_type_to_typescript_schema(Response) == snapshot)