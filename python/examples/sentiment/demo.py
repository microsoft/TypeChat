import asyncio

import sys
from dotenv import dotenv_values
import schema as sentiment
from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model


async def main():
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatValidator(sentiment.Sentiment)
    translator = TypeChatTranslator(model, validator, sentiment.Sentiment)
    print("😀> ", end="", flush=True)
    for line in sys.stdin:
        result = await translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print(f"The sentiment is {result['sentiment']}")
        print("\n😀> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
