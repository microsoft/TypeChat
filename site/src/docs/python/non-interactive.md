---
layout: doc-page
title: Non-interactive Python Quickstart
---

TypeChat can be called directly from an existing Python application.
You do not need a chatbot, an interactive console, or the `process_requests` helper.
This example classifies a single text input and returns a validated Python object that your application can use.

## Install TypeChat

You need Python 3.11 or newer.
Install TypeChat and the optional helper used here to load a local `.env` file:

```sh
pip install typechat python-dotenv
```

## Configure a language model

Create a `.env` file in the directory where you will run the example:

```sh
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-model-name
```

Replace the placeholders with your credentials and a model available to your account.
You can also set these variables in the process environment; the example gives those values precedence over the `.env` file.
For Azure OpenAI configuration, see the [Python examples configuration guide](https://github.com/microsoft/TypeChat/tree/main/python/examples#step-2-configure-environment-variables).
Do not commit your `.env` file or credentials.

## Make a single request

Save the following as `non_interactive.py`.
It is self-contained so you can copy the types and function into your own application.

```python
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
```

Run it with one text argument:

```sh
python non_interactive.py "TypeChat is awesome!"
```

Example output:

```json
{"sentiment": "positive"}
```

The script processes that request and exits; it never prompts for more input.
The response is a `Sentiment` dataclass, not raw JSON from the language model.
`TypeChatValidator` checks that the model's response matches the type, and the translator can request a repair if validation fails.
Only a successful, validated value is serialized to JSON.

If translation returns a `Failure`, either because the model call fails or validation still fails after repair, `classify_sentiment` raises a `RuntimeError` with the failure message.
The script then exits with a nonzero status instead of printing a success-shaped response.
Configuration errors and unexpected exceptions also propagate to the caller.

## Use it in an existing backend

Create the model, validator, and translator during your application's startup, and keep them available to your async request handlers or background tasks.
Keep the model's async context open for the application's lifetime and close it during shutdown.
The `async with` block in the standalone example closes the HTTP client when the one-shot request finishes, including on failure.

For example, a framework-independent async handler can return an ordinary dictionary for your web framework to serialize:

```python
from non_interactive import Sentiment, classify_sentiment
from typechat import TypeChatJsonTranslator


async def handle_request(text: str, translator: TypeChatJsonTranslator[Sentiment]) -> dict[str, str]:
    result = await classify_sentiment(text, translator)
    return {"sentiment": result.sentiment}
```

Call `await handle_request(text, translator)` from your existing async application.
Do not call `asyncio.run` inside an already-running event loop; that function is only needed at a standalone script's entry point.
Handle or log translation failures using your application's normal error handling rather than treating a failure as a sentiment value.

The [runnable sentiment example](https://github.com/microsoft/TypeChat/blob/main/python/examples/sentiment/non_interactive.py) contains the same standalone code.
For an API walkthrough and interactive exploration, see [Basic Python Usage](/docs/python/basic-usage/) and the [other Python examples](https://github.com/microsoft/TypeChat/tree/main/python/examples).
