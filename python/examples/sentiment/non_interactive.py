import argparse
import asyncio
import json
import os
from dataclasses import asdict, dataclass
from typing import Literal

from dotenv import dotenv_values
from typechat import Failure, TypeChatJsonTranslator, TypeChatValidator, create_language_model


@dataclass
class Sentiment:
    sentiment: Literal["negative", "neutral", "positive"]


async def classify_sentiment(text: str, translator: TypeChatJsonTranslator[Sentiment]) -> Sentiment:
    result = await translator.translate(text)
    if isinstance(result, Failure):
        raise RuntimeError(result.message)
    return result.value


async def main(text: str) -> None:
    settings = {**dotenv_values(), **os.environ}
    async with create_language_model(settings) as model:
        validator = TypeChatValidator(Sentiment)
        translator = TypeChatJsonTranslator(model, validator, Sentiment)
        result = await classify_sentiment(text, translator)
        print(json.dumps(asdict(result)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify one text request without starting a chat REPL.")
    parser.add_argument("text", help="The text to classify.")
    args = parser.parse_args()
    asyncio.run(main(args.text))
