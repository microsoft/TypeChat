from collections.abc import Sequence
import os
import sys
from typing import cast

examples_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if examples_path not in sys.path:
    sys.path.append(examples_path)

import json

from typing_extensions import TypeVar, Generic
from typechat import Failure, TypeChatJsonTranslator, TypeChatValidator, TypeChatLanguageModel

import examples.math.schema as math_schema
from examples.math.program import (
    TypeChatProgramTranslator,
    TypeChatProgramValidator,
    evaluate_json_program,
)

import examples.music.schema as music_schema
from examples.music.client import ClientContext, handle_call, get_client_context

T = TypeVar("T", covariant=True)


class JsonPrintAgent(Generic[T]):
    _validator: TypeChatValidator[T]
    _translator: TypeChatJsonTranslator[T]

    def __init__(self, model: TypeChatLanguageModel, target_type: type[T]):
        super().__init__()
        self._validator = TypeChatValidator(target_type)
        self._translator = TypeChatJsonTranslator(model, self._validator, target_type)

    async def handle_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(json.dumps(result, indent=2))


class MathAgent:
    _validator: TypeChatProgramValidator
    _translator: TypeChatProgramTranslator

    def __init__(self, model: TypeChatLanguageModel):
        super().__init__()
        self._validator = TypeChatProgramValidator()
        self._translator = TypeChatProgramTranslator(model, self._validator, math_schema.MathAPI)

    async def _handle_json_program_call(self, func: str, args: Sequence[object]) -> int | float:
        print(f"{func}({json.dumps(args)}) ")
        
        for arg in args:
            if not isinstance(arg, (int, float)):
                raise ValueError("All arguments are expected to be numeric.")

        args = cast(Sequence[int | float], args)

        match func:
            case "add":
                return args[0] + args[1]
            case "sub":
                return args[0] - args[1]
            case "mul":
                return args[0] * args[1]
            case "div":
                return args[0] / args[1]
            case "neg":
                return -1 * args[0]
            case "id":
                return args[0]
            case _:
                raise ValueError(f'Unexpected function name {func}')

    async def handle_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(json.dumps(result, indent=2))

            math_result = await evaluate_json_program(result, self._handle_json_program_call)
            print(f"Math Result: {math_result}")


class MusicAgent:
    _validator: TypeChatValidator[music_schema.PlayerActions]
    _translator: TypeChatJsonTranslator[music_schema.PlayerActions]
    _client_context: ClientContext | None
    _authentication_vals: dict[str, str | None]

    def __init__(self, model: TypeChatLanguageModel, authentication_vals: dict[str, str | None]):
        super().__init__()
        self._validator = TypeChatValidator(music_schema.PlayerActions)
        self._translator = TypeChatJsonTranslator(model, self._validator, music_schema.PlayerActions)
        self._authentication_vals = authentication_vals
        self._client_context = None

    async def authenticate(self):
        self._client_context = await get_client_context(self._authentication_vals)

    async def handle_request(self, line: str):
        if not self._client_context:
            await self.authenticate()

        assert self._client_context
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(json.dumps(result, indent=2))

            try:
                for action in result["actions"]:
                    await handle_call(action, self._client_context)
            except Exception as error:
                print("An exception occurred: ", error)
