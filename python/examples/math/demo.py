import asyncio
import json
import sys
from dotenv import dotenv_values
import schema as math
from typechat import Failure, create_language_model
from program import TypeChatProgramTranslator, TypeChatProgramValidator, JsonProgram, evaluate_json_program


def handle_call(func: str, args: list[int | float]):
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


async def main():
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatProgramValidator(JsonProgram)
    translator = TypeChatProgramTranslator(model, validator, math.MathAPI)
    print("🧮> ", end="", flush=True)
    for line in sys.stdin:
        result = await translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print("JSON View")
            print(json.dumps(result, indent=2))
            math_result = evaluate_json_program(result, handle_call)
            print(f"Math Result: {math_result}")

        print("\n🧮> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
