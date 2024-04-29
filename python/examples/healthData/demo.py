import asyncio
import json
import sys
from dotenv import dotenv_values
import schema as health
from typechat import Failure, TypeChatValidator, create_language_model, process_requests
from translator import TranslatorWithHistory

health_instructions = """
Help me enter my health data step by step.
Ask specific questions to gather required and optional fields I have not already providedStop asking if I don't know the answer
Automatically fix my spelling mistakes
My health data may be complex: always record and return ALL of it.
Always return a response:
- If you don't understand what I say, ask a question.
- At least respond with an OK message.

"""

async def main():
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(health.HealthDataResponse)
    translator = TranslatorWithHistory(
        model, validator, health.HealthDataResponse, additional_agent_instructions=health_instructions
    )

    async def request_handler(message: str):
        result = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            print(json.dumps(result, indent=2))

            agent_message = result.get("message", "None")
            not_translated = result.get("notTranslated", None)

            if agent_message:
                print(f"\n📝: {agent_message}")

            if not_translated:
                print(f"\n🤔: I did not understand\n {not_translated}")


    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("💉💊🤧> ", file_path, request_handler)


if __name__ == "__main__":
    asyncio.run(main())
