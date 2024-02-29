import json
from typing_extensions import Generic, TypeVar

import pydantic

from typechat._internal.result import Failure, Result, Success

T = TypeVar("T", covariant=True)

class TypeChatValidator(Generic[T]):
    """
    Validates JSON text against a given Python type.
    """

    _adapted_type: pydantic.TypeAdapter[T]

    def __init__(self, py_type: type[T]):
        """
        Args:

            py_type: The schema type to validate against.
        """
        super().__init__()
        self._adapted_type = pydantic.TypeAdapter(py_type)

    def validate_json_text(self, json_text: str) -> Result[T]:
        """
        Validates a string presumed to be JSON according to the associated schema type. Returns a
        `Success[T]` object containing a corresponding object if validation was successful. Otherwise, returns
        a `Failure` object with a `message` property describing the error.
        """
        try:
            typed_dict = self._adapted_type.validate_json(json_text, strict=True)
            return Success(typed_dict)
        except pydantic.ValidationError as validation_error:
            return _handle_error(validation_error)

    def validate_object(self, obj: object) -> Result[T]:
        """
        Validates the given Python object according to the associated schema type.
        
        Useful for translators that may presume a non-JSON output.

        Returns a `Success[T]` object containing the object if validation was successful.
        Otherwise, returns a `Failure` object with a `message` property describing the error.
        """
        try:
            typed_dict = self._adapted_type.validate_python(obj, strict=True)
            return Success(typed_dict)
        except pydantic.ValidationError as validation_error:
            return _handle_error(validation_error)


def _handle_error(validation_error: pydantic.ValidationError) -> Failure:
    error_strings: list[str] = []
    for error in validation_error.errors(include_url=False):
        error_string = ""
        loc_path = error["loc"]
        if loc_path:
            error_string += f"Validation path `{'.'.join(map(str, loc_path))}` "
        else:
            error_string += "Root validation "
        input = error["input"]
        error_string += f"failed for value `{json.dumps(input)}` because:\n  {error['msg']}"
        error_strings.append(error_string)

    if len(error_strings) > 1:
        failure_message = "Several possible issues may have occurred with the given data.\n\n"
    else:
        failure_message = ""
    failure_message += "\n".join(error_strings)

    return Failure(failure_message)
