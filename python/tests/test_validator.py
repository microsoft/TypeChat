from dataclasses import dataclass
from typing import Annotated

from pydantic import BeforeValidator
from typing_extensions import TypedDict  # Pydantic rejects typing.TypedDict on Python 3.11

import typechat


@dataclass
class Example:
    a: str
    b: int
    c: bool


v = typechat.TypeChatValidator(Example)


def test_dict_valid_as_dataclass():
    r = v.validate_object({"a": "hello!", "b": 42, "c": True})
    assert r == typechat.Success(Example(a="hello!", b=42, c=True))


class BytesDiagnostic(TypedDict):
    value: Annotated[int, BeforeValidator(lambda v: v.encode() if isinstance(v, str) else v)]


def test_non_json_serializable_diagnostic_returns_failure():
    invalid = {"value": "bad"}
    result = typechat.TypeChatValidator(BytesDiagnostic).validate_object(invalid)

    assert isinstance(result, typechat.Failure)
    assert result.value == invalid
    assert "Validation path `value`" in result.message
    assert "b'bad'" in result.message


def test_non_json_serializable_diagnostic_valid_input_still_succeeds():
    result = typechat.TypeChatValidator(BytesDiagnostic).validate_object({"value": 42})
    assert result == typechat.Success({"value": 42})
