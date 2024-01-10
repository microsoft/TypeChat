import asyncio
import json
import sys
from dotenv import dotenv_values
import schema as health
from typechat import Failure, TypeChatValidator, create_language_model
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
    vals = dotenv_values()
    model = create_language_model(vals)
    validator = TypeChatValidator(health.HealthDataResponse)
    translator = TranslatorWithHistory(
        model, validator, health.HealthDataResponse, additional_agent_instructions=health_instructions
    )
    print("💉💊🤧> ", end="", flush=True)
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

            message = result.get("message", None)
            not_translated = result.get("notTranslated", None)

            if message:
                print(f"\n📝: {message}" )
                
            if not_translated:
                print(f"\n🤔: I did not understand\n {not_translated}" )

        print("\n💉💊🤧> ", end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())