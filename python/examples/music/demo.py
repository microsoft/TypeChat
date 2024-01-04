import asyncio
import json

import sys
from dotenv import dotenv_values
import schema as music
from typechat import Failure, TypeChatTranslator, TypeChatValidator, create_language_model
from client import handle_call, get_client_context


async def main():
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatValidator(music.PlayerActions)
    translator = TypeChatTranslator(model, validator, music.PlayerActions)
    player_context = await get_client_context(vals)
    print("🎵> ", end="", flush=True)
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
            try:
                for action in result["actions"]:
                    await handle_call(action, player_context)
            except Exception as error:
                print("An exception occurred: ", error)

        print("\n🎵> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
