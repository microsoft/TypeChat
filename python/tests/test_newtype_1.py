from typing import Any, NewType
from typing_extensions import NotRequired, TypedDict

import typechat
from typechat import python_type_to_typescript_schema
from .utilities import TypeScriptSchemaSnapshotExtension

UserId = NewType("UserId", str)
Count = NewType("Count", int)
AdminId = NewType("AdminId", UserId)

class Profile(TypedDict):
    user_id: UserId
    count: Count
    admin_id: AdminId
    tags: list[UserId]
    scores: dict[str, Count]
    optional_id: UserId | None
    maybe_count: NotRequired[Count]

def test_newtype_1(snapshot: Any):
    result = python_type_to_typescript_schema(Profile)
    assert result.errors == []
    assert result == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)

def test_newtype_validation():
    v = typechat.TypeChatValidator(Profile)
    valid = {"user_id": "a", "count": 1, "admin_id": "b", "tags": ["c"], "scores": {"x": 2}, "optional_id": None}
    assert isinstance(v.validate_object(valid), typechat.Success)
    assert isinstance(v.validate_object({**valid, "user_id": 42}), typechat.Failure)
    assert isinstance(v.validate_object({**valid, "count": "1"}), typechat.Failure)

class Unsupported(TypedDict):
    value: NewType("Weird", 1.5)  # type: ignore

def test_newtype_unsupported_underlying_type_reports_error():
    assert python_type_to_typescript_schema(Unsupported).errors != []
