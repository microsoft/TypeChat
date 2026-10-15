from typing import NewType, TypedDict

from typechat import python_type_to_typescript_schema

UserId = NewType("UserId", str)
AdminId = NewType("AdminId", UserId)


class User(TypedDict):
    user_id: AdminId


def test_newtype_uses_underlying_type():
    result = python_type_to_typescript_schema(User)

    assert result.errors == []
    assert "user_id: string;" in result.typescript_schema_str
