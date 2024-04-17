import asyncio

import sys
from dotenv import dotenv_values
import schema as sentiment
from typechat import Failure, TypeChatJsonTranslator, TypeChatValidator, create_language_model, process_requests

async def main():    
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(sentiment.Sentiment)
    translator = TypeChatJsonTranslator(model, validator, sentiment.Sentiment)

    async def request_handler(message: str):
        result = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(f"The sentiment is {result.sentiment}")

    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("😀> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
