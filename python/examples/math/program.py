from __future__ import annotations
import asyncio
from collections.abc import Sequence
from typing import Any, TypeAlias, TypedDict, cast
from typing_extensions import (
    TypeVar,
    Callable,
    Awaitable,
    Annotated,
    NotRequired,
    override,
    Doc,
)

from typechat import (
    Failure,
    Success,
    TypeChatLanguageModel,
    TypeChatValidator,
    TypeChatJsonTranslator,
    python_type_to_typescript_schema,
)

T = TypeVar("T", covariant=True)


Expression: TypeAlias = "str | int | float | bool | None | dict[str, Expression] | list[Expression] | FunctionCall | ResultReference"

JsonProgram = TypedDict("JsonProgram", {"@steps": list["FunctionCall"]})


ResultReference = TypedDict(
    "ResultReference", {"@ref": Annotated[int, Doc("Index of the previous expression in the 'steps' array")]}
)

FunctionCall = TypedDict(
    "FunctionCall",
    {
        "@func": Annotated[str, Doc("Name of the function")],
        "@args": NotRequired[Annotated[list[Expression], Doc("Arguments for the function, if any")]],
    },
)

translation_result = python_type_to_typescript_schema(JsonProgram)
program_schema_text = translation_result.typescript_schema_str


JsonValue = str | int | float | bool | None | dict[str, "JsonValue"] | list["JsonValue"]

async def evaluate_json_program(
    program: JsonProgram,
    onCall: Callable[[str, Sequence[JsonValue]], Awaitable[JsonValue]]
) -> JsonValue:
    results: list[JsonValue] = []

    def evaluate_array(array: Sequence[JsonValue]) -> Awaitable[list[JsonValue]]:
        return asyncio.gather(*[evaluate_expression(e) for e in array])

    async def evaluate_expression(expr: JsonValue) -> JsonValue:
        match expr:
            case bool() | int() | float() | str() | None:
                return expr

            case { "@ref": int(index) } if not isinstance(index, bool):
                if 0 <= index < len(results):
                    return results[index]
                
                raise ValueError(f"Index {index} is out of range [0, {len(results)})")

            case { "@ref": ref_value }:
                raise ValueError(f"'ref' value must be an integer, but was ${ref_value}")

            case { "@func": str(function_name) }:
                args: list[JsonValue]
                match expr:
                    case { "@args": None }:
                        args = []
                    case { "@args": list() }:
                        args = cast(list[JsonValue], expr["@args"]) # TODO
                    case { "@args": _ }:
                        raise ValueError("Given an invalid value for '@args'.")
                    case _:
                        args = []

                return await onCall(function_name, await evaluate_array(args))
            
            case list(array_expression_elements):
                return await evaluate_array(array_expression_elements)    

            case _:
                raise ValueError("This condition should never hit")

    for step in program["@steps"]:
        results.append(await evaluate_expression(cast(JsonValue, step)))

    if len(results) > 0:
        return results[-1]
    else:
        return None


class TypeChatProgramValidator(TypeChatValidator[JsonProgram]):
    def __init__(self):
        # TODO: This example should eventually be updated to use Python 3.12 type aliases
        # Passing in `JsonProgram` for `py_type` would cause issues because
        # Pydantic's `TypeAdapter` ends up trying to eagerly construct an
        # anonymous recursive type. Even a NewType does not work here.
        # For now, we just pass in `Any` in place of `JsonProgram`.
        super().__init__(py_type=cast(type[JsonProgram], Any))

    @override
    def validate_object(self, obj: Any) -> Success[JsonProgram] | Failure:
        if "@steps" in obj and isinstance(obj["@steps"], Sequence):
            return Success(obj)
        else:
            return Failure("This is not a valid program. The program must have an array of @steps")
        


class TypeChatProgramTranslator(TypeChatJsonTranslator[JsonProgram]):
    _api_declaration_str: str

    def __init__(self, model: TypeChatLanguageModel, validator: TypeChatProgramValidator, api_type: type):
        super().__init__(model=model, validator=validator, target_type=api_type, _raise_on_schema_errors = False)
        # TODO: the conversion result here has errors!
        conversion_result = python_type_to_typescript_schema(api_type)
        self._api_declaration_str = conversion_result.typescript_schema_str

    @override
    def _create_request_prompt(self, intent: str) -> str:

        prompt = F"""
You are a service that translates user requests into programs represented as JSON using the following TypeScript definitions:
```
{program_schema_text}
```
The programs can call functions from the API defined in the following TypeScript definitions:
```
{self._api_declaration_str}
```
The following is a user request:
'''
{intent}
'''
The following is the user request translated into a JSON program object with 2 spaces of indentation and no properties with the value undefined:
"""
        return prompt

    @override
    def _create_repair_prompt(self, validation_error: str) -> str:
        prompt = F"""
The JSON program object is invalid for the following reason:
'''
{validation_error}
'''
The following is a revised JSON program object:
"""
        return prompt
