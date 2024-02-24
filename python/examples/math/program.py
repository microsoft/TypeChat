from __future__ import annotations
import asyncio
from collections.abc import Sequence
import json
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
    Result,
    Success,
    TypeChatLanguageModel,
    TypeChatValidator,
    TypeChatTranslator,
    python_type_to_typescript_schema,
)

T = TypeVar("T", covariant=True)


program_schema_text = '''
// A program consists of a sequence of function calls that are evaluated in order.
export type Program = {
    "@steps": FunctionCall[];
}

// A function call specifies a function name and a list of argument expressions. Arguments may contain
// nested function calls and result references.
export type FunctionCall = {
    // Name of the function
    "@func": string;
    // Arguments for the function, if any
    "@args"?: Expression[];
};

// An expression is a JSON value, a function call, or a reference to the result of a preceding expression.
export type Expression = JsonValue | FunctionCall | ResultReference;

// A JSON value is a string, a number, a boolean, null, an object, or an array. Function calls and result
// references can be nested in objects and arrays.
export type JsonValue = string | number | boolean | null | { [x: string]: Expression } | Expression[];

// A result reference represents the value of an expression from a preceding step.
export type ResultReference = {
    // Index of the previous expression in the "@steps" array
    "@ref": number;
};
'''


ResultReference = TypedDict(
    "ResultReference", {"@ref": Annotated[int, Doc("Index of the previous expression in the 'steps' array")]}
)

FunctionCall = TypedDict(
    "FunctionCall",
    {
        "@func": Annotated[str, Doc("Name of the function")],
        "@args": NotRequired[Annotated[list["Expression"], Doc("Arguments for the function, if any")]],
    },
)

JsonValue: TypeAlias = str | int | float | bool | None | dict[str, "Expression"] | list["Expression"]
Expression: TypeAlias = JsonValue | FunctionCall | ResultReference

JsonProgram = TypedDict("JsonProgram", {"@steps": list[FunctionCall]})

async def evaluate_json_program(
    program: JsonProgram,
    onCall: Callable[[str, Sequence[object]], Awaitable[JsonValue]]
) -> Expression:
    results: list[JsonValue] = []

    def evaluate_array(array: Sequence[Expression]) -> Awaitable[list[Expression]]:
        return asyncio.gather(*[evaluate_expression(e) for e in array])

    async def evaluate_expression(expr: Expression) -> JsonValue:
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
                args: list[Expression]
                match expr:
                    case { "@args": None }:
                        args = []
                    case { "@args": list() }:
                        args = cast(list[Expression], expr["@args"]) # TODO
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
        results.append(await evaluate_expression(step))

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
    def validate(self, json_text: str) -> Result[JsonProgram]:
        # Pydantic is not able to validate JsonProgram instances. It fails with a recursion error.
        # For JsonProgram, so we simply validate that it has a non-zero number of `@steps`.
        # TODO: extend validations
        typed_dict = json.loads(json_text)
        if "@steps" in typed_dict and isinstance(typed_dict["@steps"], Sequence):
            return Success(typed_dict)
        else:
            return Failure("This is not a valid program. The program must have an array of @steps")


class TypeChatProgramTranslator(TypeChatTranslator[JsonProgram]):
    _api_declaration_str: str

    def __init__(self, model: TypeChatLanguageModel, validator: TypeChatProgramValidator, api_type: type):
        super().__init__(model=model, validator=validator, target_type=api_type)
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
