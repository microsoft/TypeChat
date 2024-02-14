import asyncio

import sys
from dotenv import dotenv_values
import schema as sentiment
from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model, process_requests

vals = dotenv_values()
model = create_language_model(vals)
validator = TypeChatValidator(sentiment.Sentiment)
translator = TypeChatTranslator(model, validator, sentiment.Sentiment)


async def request_handler(message: str):
    result = await translator.translate(message)
    if isinstance(result, Failure):
        print(result.message)
    else:
        result = result.value
        print(f"The sentiment is {result['sentiment']}")


async def main():
    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("😀> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
