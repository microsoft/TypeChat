import asyncio
import json

import sys
from dotenv import dotenv_values
import schema as music
from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model, process_requests
from client import handle_call, get_client_context, ClientContext

vals = dotenv_values()
model = create_language_model(vals)
validator = TypeChatValidator(music.PlayerActions)
translator = TypeChatTranslator(model, validator, music.PlayerActions)
player_context: ClientContext

async def request_handler(message: str):
    result = await translator.translate(message)
    if isinstance(result, Failure):
        print(result.message)
    else:
        result = result.value
        print(json.dumps(result, indent=2))
        try:
            for action in result["actions"]:
                await handle_call(action, player_context)
        except Exception as error:
            print("An exception occurred: ", error)

        if any(item["actionName"] == "Unknown" for item in result["actions"]):
            print("I did not understand the following")
            for item in result["actions"]:
                if item["actionName"] == "Unknown":
                    print(item["text"])


async def main():
    global player_context
    player_context = await get_client_context(vals)
    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("🎵> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
