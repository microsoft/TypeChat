import json
from typing import Generic, TypeVar

import pydantic

from typechat._internal.result import Failure, Result, Success

T = TypeVar("T", covariant=True)

class TypeChatValidator(Generic[T]):
    _type: type[T]
    _adapted_type: pydantic.TypeAdapter[T]

    def __init__(self, py_type: type[T]):
        super().__init__()
        self._type = py_type
        self._adapted_type = pydantic.TypeAdapter(py_type)

    def validate(self, json_text: str) -> Result[T]:
        try:
            typed_dict = self._adapted_type.validate_json(json_text, strict=True)
            return Success(typed_dict)
        except pydantic.ValidationError as validation_error:
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
