---
layout: doc-page
title: Basic Python Usage
---

TypeChat is currently a small library, so we can get a solid understanding just by going through the following example:

```py
import asyncio

import sys
import schema as sentiment
from typechat import Failure, TypeChatJsonTranslator, TypeChatValidator, create_language_model, process_requests

async def main():
env_vals = dotenv_values()

# Create a model.
model = create_language_model(env_vals)

# Create a validator
validator = TypeChatValidator(sentiment.Sentiment)

# Create a translator.
translator = TypeChatJsonTranslator(model, validator, sentiment.Sentiment)

async def request_handler(message: str):
    result = await translator.translate(message)
    if isinstance(result, Failure):
        print(result.message)
    else:
        result = result.value
        print(f"The sentiment is {result.sentiment}")

# Process requests interactively or from the input file specified on the command line.
file_path = sys.argv[1] if len(sys.argv) == 2 else None
await process_requests("😀> ", file_path, request_handler)
```

Let's break it down step-by-step.

## Providing a Model

TypeChat can be used with any language model.
As long as you have a class with the following shape...

```py
class TypeChatLanguageModel(Protocol):

    async def complete(self, prompt: str | list[PromptSection]) -> Result[str]:
        """
        Represents a AI language model that can complete prompts.
        
        TypeChat uses an implementation of this protocol to communicate
        with an AI service that can translate natural language requests to JSON
        instances according to a provided schema.
        The `create_language_model` function can create an instance.
        """
        ...
```

then you should be able to try TypeChat out with such a model.

The key thing here is providing a `complete` method.
`complete` is just a function that takes a `string` and eventually returns a `string` if all goes well.

For convenience, TypeChat provides two functions out of the box to connect to the OpenAI API and Azure's OpenAI Services.
You can call these directly.

```py
def create_openai_language_model(
    api_key: str,
    model: str,
    endpoint: str = "https://api.openai.com/v1/chat/completions",
    org: str = ""
):
    ...

def create_azure_openai_language_model(api_key: str, endpoint: str):
```

For even more convenience, TypeChat also provides a function to infer whether you're using OpenAI or Azure OpenAI.

```ts
def create_language_model(vals: dict[str, str | None]) -> TypeChatLanguageModel:
```

With `create_language_model`, you can populate your environment variables and pass them in.
Based on whether `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` is set, you'll get a model of the appropriate type.

The `TypeChatLanguageModel` returned by these functions has a few attributes you might find useful:

- `max_retry_attempts`
- `retry_pause_seconds`
- `timeout_seconds`

Though note that these are unstable.

Regardless, of how you decide to construct your model, it is important to avoid committing credentials directly in source.
One way to make this work between production and development environments is to use a `.env` file in development, and specify that `.env` in your `.gitignore`.
You can use a library like [`python-dotenv`](https://pypi.org/project/python-dotenv/) to help load these up.

```py
from dotenv import load_dotenv
load_dotenv()

// ...

import typechat
model = typechat.create_language_model(os.environ)
```

## Defining and Loading the Schema

TypeChat describes types to language models to help guide their responses.
To do so, all we have to do is define either a [`@dataclass`](https://docs.python.org/3/library/dataclasses.html) or a [`TypedDict`](https://typing.readthedocs.io/en/latest/spec/typeddict.html) class to describe the response we're expecting.
Here's what our schema file `schema.py` look like:

```py
from dataclasses import dataclass
from typing import Literal

@dataclass
class Sentiment:
    """
    The following is a schema definition for determining the sentiment of a some user input.
    """

    sentiment: Literal["negative", "neutral", "positive"]
```

Here, we're saying that the `sentiment` attribute has to be one of three possible strings: `negative`, `neutral`, or `positive`.
We did this with [the `typing.Literal` hint](https://docs.python.org/3/library/typing.html#typing.Literal).

We defined `Sentiment` as a `@dataclass` so we could have all of the conveniences of standard Python objects - for example, to access the `sentiment` attribute, we can just write `value.sentiment`.
If we declared `Sentiment` as a `TypedDict`, TypeChat would provide us with a `dict`.
That would mean that to access the value of `sentiment`, we would have to write `value["sentiment"]`.

Note that while we used [the built-in `typing` module](https://docs.python.org/3/library/typing.html), [`typing_extensions`](https://pypi.org/project/typing-extensions/) is supported as well.
TypeChat also understands constructs like `Annotated` and `Doc` to add comments to individual attributes.

## Creating a Validator

A validator really has two jobs generating a textual schema for language models, and making sure any data fits a given shape.
The built-in validator looks roughly like this:

```py
class TypeChatValidator(Generic[T]):
    """
    Validates an object against a given Python type.
    """

    def __init__(self, py_type: type[T]):
        """
        Args:

            py_type: The schema type to validate against.
        """
        ...

    def validate_object(self, obj: object) -> Result[T]:
        """
        Validates the given Python object according to the associated schema type.

        Returns a `Success[T]` object containing the object if validation was successful.
        Otherwise, returns a `Failure` object with a `message` property describing the error.
        """
        ...
```

To construct a validator, we just have to pass in the type we defined:

```py
import schema as sentiment
validator = TypeChatValidator(sentiment.Sentiment)
```

## Creating a JSON Translator

A `TypeChatJsonTranslator` brings all these concepts together.
A translator takes a language model, a validator, and our expected type, and provides a way to translate some user input into objects following our schema.
To do so, it crafts a prompt based on the schema, reaches out to the model, parses out JSON data, and attempts validation.
Optionally, it will craft repair prompts and retry if validation fails.

```py
translator = TypeChatJsonTranslator(model, validator, sentiment.Sentiment)
```

When we are ready to translate a user request, we can call the `translate` method.

```ts
translator.translate("Hello world! 🙂");
```

We'll come back to this.

## Creating the Prompt

TypeChat exports a `process_requests` function that makes it easy to experiment with TypeChat.
Depending on its second argument, it either creates an interactive command line prompt (if given `None`), or reads lines in from the given a file path.

```ts
async def request_handler(message: str):
    ...

file_path = sys.argv[1] if len(sys.argv) == 2 else None
await process_requests("😀> ", file_path, request_handler)
```

`process_requests` takes 3 things.
First, there's the prompt prefix - this is what a user will see before their own text in interactive scenarios.
You can make this playful.
We like to use emoji here. 😄

Next, we take a text file name.
Input strings will be read from this file on a per-line basis.
If the file name was `None`, `process_requests` will work on standard input and provide an interactive prompt.
By checking `sys.argv`, our script makes our program interactive unless the person running the program provided an input file as a command line argument (e.g. `python ./example.py inputFile.txt`).

Finally, there's the request handler.
We'll fill that in next.

## Translating Requests

Our handler receives some user input (the `message` string) each time it's called.
It's time to pass that string into over to our `translator` object.

```ts
async def request_handler(message: str):
    result = await translator.translate(message)
    if isinstance(result, Failure):
        print(result.message)
    else:
        result = result.value
        print(f"The sentiment is {result.sentiment}")
```

We're calling the `translate` method on each string and getting a response.
If something goes wrong, TypeChat will retry requests up to a maximum specified by `retry_max_attempts` on our `model`.
However, if the initial request as well as all retries fail, `result` will be a `typechat.Failure` and we'll be able to grab a `message` explaining what went wrong.

In the ideal case, `result` will be a `typechat.Success` and we'll be able to access our well-typed `value` property!
This will correspond to the type that we passed in when we created our translator object (i.e. `Sentiment`).

That's it!
You should now have a basic idea of TypeChat's APIs and how to get started with a new project. 🎉
