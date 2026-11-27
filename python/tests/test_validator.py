import types
from dataclasses import dataclass, field
from typing import Annotated

from pydantic import BeforeValidator
from typing_extensions import TypedDict  # Pydantic rejects typing.TypedDict on Python 3.11

import typechat
import typechat._internal.validator as validator_module


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
    assert result.value is invalid
    assert "Validation path `value`" in result.message
    assert "<non-JSON bytes>" in result.message


def test_non_json_serializable_diagnostic_valid_input_still_succeeds():
    result = typechat.TypeChatValidator(BytesDiagnostic).validate_object({"value": 42})
    assert result == typechat.Success({"value": 42})


@dataclass
class UnsetField:
    # `init=False` leaves the attribute unset, so the generated `__repr__`
    # raises `AttributeError` if a diagnostic ever tries to format it.
    value: int = field(init=False)


def _returns_unset_dataclass(_value: object) -> UnsetField:
    return UnsetField()


class UnsetFieldDiagnostic(TypedDict):
    value: Annotated[int, BeforeValidator(_returns_unset_dataclass)]


def test_diagnostic_does_not_rely_on_user_defined_repr():
    invalid = {"value": "bad"}
    result = typechat.TypeChatValidator(UnsetFieldDiagnostic).validate_object(invalid)

    assert isinstance(result, typechat.Failure)
    assert result.value is invalid
    assert "Validation path `value`" in result.message
    assert "<non-JSON UnsetField>" in result.message
    assert "Input should be a valid integer" in result.message


def test_json_serializable_diagnostic_keeps_json_formatting():
    invalid = {"a": "hello!", "b": "pending", "c": True}
    result = v.validate_object(invalid)

    assert isinstance(result, typechat.Failure)
    assert result.value is invalid
    assert "Validation path `b`" in result.message
    assert 'failed for value `"pending"`' in result.message


def test_recursion_error_while_formatting_diagnostic_returns_failure(monkeypatch):
    def raise_recursion_error(*_args, **_kwargs):
        msg = "maximum recursion depth exceeded while encoding"
        raise RecursionError(msg)

    # Only replace the module's reference so the global `json` module is untouched.
    monkeypatch.setattr(validator_module, "json", types.SimpleNamespace(dumps=raise_recursion_error))

    invalid = {"a": "hello!", "b": "pending", "c": True}
    result = v.validate_object(invalid)

    assert isinstance(result, typechat.Failure)
    assert result.value is invalid
    assert "Validation path `b`" in result.message
    assert "<non-JSON str>" in result.message
