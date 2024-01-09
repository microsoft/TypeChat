import asyncio
import json
import sys

import schema as coffeeshop
from dotenv import dotenv_values

from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model


async def main():
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatValidator(coffeeshop.Cart)
    translator = TypeChatTranslator(model, validator, coffeeshop.Cart)
    print("☕> ", end="", flush=True)
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
        print("\n☕> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
