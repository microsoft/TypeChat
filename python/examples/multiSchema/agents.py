import os
import sys

examples_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if examples_path not in sys.path:
    sys.path.append(examples_path)

import json

from typing import TypeVar, Generic
from typechat import Failure, TypeChatTranslator, TypeChatValidator, TypeChatModel

import examples.math.schema as math_schema
from examples.math.program import TypeChatProgramTranslator, TypeChatProgramValidator, evaluate_json_program, JsonProgram

import examples.music.schema as music_schema
from examples.music.client import ClientContext, handle_call, get_client_context

T = TypeVar("T", covariant=True)

class JsonPrintAgent(Generic[T]):
    _validator: TypeChatValidator[T]
    _translator: TypeChatTranslator[T]

    def __init__(self, model: TypeChatModel, target_type: type[T]):
        super().__init__()
        self._validator = TypeChatValidator(target_type)
        self._translator = TypeChatTranslator(model, self._validator, target_type)

    async def handle_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print("JSON View")
            print(json.dumps(result, indent=2))


class MathAgent:
    _validator: TypeChatProgramValidator
    _translator: TypeChatProgramTranslator[math_schema.MathAPI]

    def __init__(self, model: TypeChatModel):
        self._validator = TypeChatProgramValidator(JsonProgram)
        self._translator = TypeChatProgramTranslator(model, self._validator, math_schema.MathAPI)

    async def _handle_jsonProgram_call(self, func: str, args: list[int|float]):
        print(f"{func}({json.dumps(args)}) ")
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

    async def handle_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print("JSON View")
            print(json.dumps(result, indent=2))

            math_result = await evaluate_json_program(result, self._handle_jsonProgram_call)
            print(f"Math Result: {math_result}")


class MusicAgent:
    _validator: TypeChatValidator[music_schema.PlayerActions]
    _translator: TypeChatTranslator[music_schema.PlayerActions]
    _client_context: ClientContext

    def __init__(self, model: TypeChatModel, vals: dict[str,str | None]):
        self._validator = TypeChatValidator(music_schema.PlayerActions)
        self._translator = TypeChatTranslator(model, self._validator, music_schema.PlayerActions)
        self._client_context = get_client_context(vals)

    async def handle_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print("JSON View")
            print(json.dumps(result, indent=2))

            try:
                for action in result["actions"]:
                    await handle_call(action, self._client_context)
            except Exception as error:
                print("An exception occurred: ", error)
