import asyncio
import json
import sys

import openai
import schema as coffeeshop
from dotenv import dotenv_values

from typechat import DefaultOpenAIModel, Failure, TypeChatTranslator, TypeChatValidator


async def main():
    vals = dotenv_values()
    client = openai.AsyncOpenAI(api_key=vals["OPENAI_API_KEY"])
    model = DefaultOpenAIModel(model_name=vals.get("OPENAI_MODEL", None) or "gpt-3.5-turbo", client=client)
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
