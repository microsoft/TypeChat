import asyncio
import json

import sys
from dotenv import dotenv_values
import schema as calendar
from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model


async def main():
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatValidator(calendar.CalendarActions)
    translator = TypeChatTranslator(model, validator, calendar.CalendarActions)
    print("📅> ", end="", flush=True)
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
        print("\n📅> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())