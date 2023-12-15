import json
import sys
from dataclasses import dataclass
from typing import override

import openai
import schema as coffeeshop
from dotenv import dotenv_values

from typechat import Failure, Result, Success, TypeChatModel, TypeChatTranslator, TypeChatValidator


@dataclass
class OpenAIModel(TypeChatModel):
    model_name: str
    client: openai.OpenAI | openai.AzureOpenAI

    @override
    def complete(self, input: str) -> Result[str]:
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": input}],
                temperature=0.0,
            )
            content = response.choices[0].message.content
            if content is None:
                return Failure("Response did not contain any text.")
            return Success(content)
        except Exception as e:
            return Failure(str(e))


def main():
    vals = dotenv_values()
    client = openai.OpenAI(api_key=vals["OPENAI_API_KEY"])
    model = OpenAIModel(model_name=vals.get("OPENAI_MODEL", None) or "gpt-3.5-turbo", client=client)
    validator = TypeChatValidator(coffeeshop.Cart)
    translator = TypeChatTranslator(model, validator, coffeeshop.Cart)
    print("☕> ", end="", flush=True)
    for line in sys.stdin:
        result = translator.translate(line)
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
    print("Starting")
    main()
