import asyncio
import json
import sys
from typing import Any

import schema as drawing
from dotenv import dotenv_values

from typechat import Success, Failure, TypeChatJsonTranslator, TypeChatValidator, create_language_model, process_requests


async def main(file_path: str | None):
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(drawing.Drawing)
    translator = TypeChatJsonTranslator(model, validator, drawing.Drawing)
    print(translator._schema_str)

    async def request_handler(message: str):
        result: Success[drawing.Drawing] | Failure = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            value = result.value
            print(json.dumps(value, indent=2))
            if any(item["type"] == "Unknown" for item in value["items"]):
                print("I did not understand the following")
                for item in value["items"]:
                    if item["type"] == "Unknown":
                        print(item["text"])

    await process_requests("~> ", file_path, request_handler)


if __name__ == "__main__":
    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    asyncio.run(main(file_path))
