import json
from typing_extensions import Generic, TypeVar

import pydantic
import pydantic_core

from typechat._internal.result import Failure, Result, Success

T = TypeVar("T", covariant=True)


class TypeChatValidator(Generic[T]):
    """
    Validates an object against a given Python type.
    """

    _adapted_type: pydantic.TypeAdapter[T]

    def __init__(self, py_type: type[T]):
        """
        Args:

            py_type: The schema type to validate against.
        """
        super().__init__()
        self._adapted_type = pydantic.TypeAdapter(py_type)

    def validate_object(self, obj: object) -> Result[T]:
        """
        Validates the given Python object according to the associated schema type.

        Returns a `Success[T]` object containing the object if validation was successful.
        Otherwise, returns a `Failure` with an error message and the rejected object in `value`.
        """
        try:
            # TODO: Switch to `validate_python` when validation modes are exposed.
            # https://github.com/pydantic/pydantic-core/issues/712
            # We'd prefer to keep `validate_object` as the core method and
            # allow translators to concern themselves with the JSON instead.
            # However, under Pydantic's `strict` mode, a `dict` isn't considered compatible
            # with a dataclass. So for now, jump back to JSON and validate the string.
            json_str = pydantic_core.to_json(obj)
            typed_dict = self._adapted_type.validate_json(json_str, strict=True)
            return Success(typed_dict)
        except pydantic.ValidationError as validation_error:
            return _handle_error(validation_error, obj)


def _handle_error(validation_error: pydantic.ValidationError, value: object) -> Failure:
    error_strings: list[str] = []
    for error in validation_error.errors(include_url=False):
        error_string = ""
        loc_path = error["loc"]
        if loc_path:
            error_string += f"Validation path `{'.'.join(map(str, loc_path))}` "
        else:
            error_string += "Root validation "
        input = error["input"]
        try:
            input_text = json.dumps(input)
        except (TypeError, ValueError, RecursionError):
            # Pydantic diagnostics can carry intermediate values that are not
            # JSON-serializable (for example bytes from a BeforeValidator), and
            # deeply nested values can exhaust the encoder's recursion limit.
            # We avoid `repr()` here because user-defined `__repr__` methods can
            # raise too (for example, a dataclass with an unset `init=False`
            # field), which would mask the original validation error.
            # Validation must return a Failure, not raise while formatting it.
            input_text = f"<non-JSON {type(input).__name__}>"
        error_string += f"failed for value `{input_text}` because:\n  {error['msg']}"
        error_strings.append(error_string)

    if len(error_strings) > 1:
        failure_message = "Several possible issues may have occurred with the given data.\n\n"
    else:
        failure_message = ""
    failure_message += "\n".join(error_strings)

    return Failure(failure_message, value=value)
