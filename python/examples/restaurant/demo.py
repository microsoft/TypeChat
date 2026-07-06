import asyncio
import json
import sys
from dotenv import dotenv_values
import schema as restaurant
from typechat import Failure, TypeChatJsonTranslator, TypeChatValidator, create_language_model, process_requests

async def main():
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(restaurant.Order)
    translator = TypeChatJsonTranslator(model, validator, restaurant.Order)

    async def request_handler(message: str):
        result = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(json.dumps(result, indent=2))
            if any(item["itemType"] == "Unknown" for item in result["items"]):
                print("I did not understand the following")
                for item in result["items"]:
                    if item["itemType"] == "Unknown":
                        print(item["text"])

    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("🍕> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
