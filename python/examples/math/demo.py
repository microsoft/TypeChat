import asyncio
from collections.abc import Sequence
import json
import sys
from typing import cast
from dotenv import dotenv_values
import schema as math
from typechat import Failure, create_language_model, process_requests
from program import TypeChatProgramTranslator, TypeChatProgramValidator, evaluate_json_program

async def main():
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatProgramValidator()
    translator = TypeChatProgramTranslator(model, validator, math.MathAPI)

    async def request_handler(message: str):
        result = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(json.dumps(result, indent=2))
            math_result = await evaluate_json_program(result, apply_operations)
            print(f"Math Result: {math_result}")

    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("🧮> ", file_path, request_handler)


async def apply_operations(func: str, args: Sequence[object]) -> int | float:
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

if __name__ == "__main__":
    asyncio.run(main())
