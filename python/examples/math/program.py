from __future__ import annotations
import asyncio
import json
from textwrap import dedent, indent
from typing import Mapping, TypeVar, Any, Callable, Awaitable, TypedDict, Annotated,  NotRequired, override, Sequence

from typechat import (
    Failure,
    Result,
    Success,
    TypeChatModel,
    TypeChatValidator,
    TypeChatTranslator,
    python_type_to_typescript_schema,
)
import collections.abc

T = TypeVar("T", covariant=True)

def Doc(s: str) -> str:
    return s


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

JsonValue = str | int | float | bool | None | dict[str, "Expression"] | list["Expression"]
Expression = JsonValue | FunctionCall | ResultReference

JsonProgram = TypedDict("Program", {"@steps": list[FunctionCall]})


async def evaluate_json_program(program: JsonProgram, onCall: Callable[[str, Sequence[Any]], Awaitable[Any]]) -> Any:
    results: list[Any] = []

    async def evaluate_array(array: Sequence[Expression]) -> Sequence[Expression]:
        return await asyncio.gather(*[evaluate_call(e) for e in array]) # type: ignore

    async def evaluate_object(expr: FunctionCall):
        if "@ref" in expr:
            index = expr["@ref"]
            if index < len(results):
                return results[index]

        elif "@func" in expr and "@args" in expr:
            function_name = expr["@func"]
            return await onCall(function_name, await evaluate_array(expr["@args"]))

        elif isinstance(expr, collections.abc.Sequence):
            return await evaluate_array(expr)

        else:
            raise ValueError("This condition should never hit")

    async def evaluate_call(expr: FunctionCall):
        if isinstance(expr, int) or isinstance(expr, float) or isinstance(expr, str):
            return expr
        return await evaluate_object(expr)

    for step in program["@steps"]:
        results.append(await evaluate_call(step))

    if len(results) > 0:
        return results[-1]
    else:
        return None


class TypeChatProgramValidator(TypeChatValidator[T]):
    def __init__(self, py_type: type[T]):
        # the base class init method creates a typeAdapter for T. This operation fails for the JsonProgram type
        super().__init__(py_type=Any)

    @override
    def validate(self, json_text: str) -> Result[T]:
        # Pydantic is not able to validate JsonProgram instances. It fails with a recursion error.
        # For JsonProgram, simply validate that it has a non-zero number of @steps
        # TODO: extend validations
        typed_dict = json.loads(json_text)
        if "@steps" in typed_dict and isinstance(typed_dict["@steps"], collections.abc.Sequence):
            return Success(typed_dict)
        else:
            return Failure("This is not a valid program. The program must have an array of @steps")


class TypeChatProgramTranslator(TypeChatTranslator[T]):
    _api_declaration_str: str

    def __init__(self, model: TypeChatModel, validator: TypeChatProgramValidator[T], api_type: type):
        super().__init__(model=model, validator=validator, target_type=Any)
        conversion_result = python_type_to_typescript_schema(api_type)
        self._api_declaration_str = conversion_result.typescript_schema_str

    @override
    def _create_request_prompt(self, intent: str) -> str:
        api_decl_str = indent(self._api_declaration_str, "            ")

        prompt = F"""
            You are a service that translates user requests into programs represented as JSON using the following TypeScript definitions:
            ```
            {program_schema_text}
            ```
            The programs can call functions from the API defined in the following TypeScript definitions:
            ```
            {api_decl_str}
            ```
            The following is a user request:
            '''
            {intent}
            '''
            The following is the user request translated into a JSON program object with 2 spaces of indentation and no properties with the value undefined:
            """
        prompt = dedent(prompt)
        return prompt

    @override
    def _create_repair_prompt(self, validation_error: str) -> str:
        validation_error = indent(validation_error, "            ")
        prompt = F"""
            The JSON program object is invalid for the following reason:
            '''
            {validation_error}
            '''
            The following is a revised JSON program object:
            """
        return dedent(prompt)
