import argparse
import asyncio
import json
import os
from dataclasses import asdict, dataclass
from typing import Literal

from dotenv import dotenv_values
from typechat import (
    Failure,
    ResponsesClient,
    Result,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
    TypeChatValidator,
    create_language_model,
    create_openai_language_model_from_client,
)


@dataclass
class Sentiment:
    sentiment: Literal["negative", "neutral", "positive"]


async def classify(text: str, model: TypeChatLanguageModel) -> Result[Sentiment]:
    translator = TypeChatJsonTranslator(model, TypeChatValidator(Sentiment), Sentiment)
    return await translator.translate(text)


async def classify_with_client(text: str, client: ResponsesClient, model: str) -> Result[Sentiment]:
    return await classify(text, create_openai_language_model_from_client(client, model, use_responses_api=True))


async def main(text: str, model_name: str | None = None) -> None:
    settings = {**dotenv_values(), **os.environ}
    async with create_language_model(settings, use_responses_api=True, model=model_name) as model:
        result = await classify(text, model)
        if isinstance(result, Failure):
            raise RuntimeError(result.message)
        print(json.dumps(asdict(result.value)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify text using an explicitly selected Responses API.")
    parser.add_argument("text", help="The text to classify.")
    parser.add_argument("--model", help="Explicit model or Azure deployment name (required for Azure).")
    args = parser.parse_args()
    asyncio.run(main(args.text, args.model))
