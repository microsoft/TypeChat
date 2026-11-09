---
layout: doc-page
title: Basic Python Usage
---

For a runnable example without a chat loop and guidance on backend integration, start with the
[non-interactive Python quickstart](/docs/python/non-interactive/).

TypeChat is currently a small library, so we can get a solid understanding
just by going through the following example:

```py
import asyncio
import sys

from dotenv import dotenv_values
from typechat import (Failure, TypeChatJsonTranslator, TypeChatValidator,
                      create_language_model, process_requests)

import schema as sentiment  # See below for what's in schema.py.

async def main():
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(sentiment.Sentiment)
    translator = TypeChatJsonTranslator(model, validator, sentiment.Sentiment)

    async def request_handler(message: str):
        result = await translator.translate(message)
        if isinstance(result, Failure):
            print(result.message)
        else:
            result = result.value
            print(f"The sentiment is {result['sentiment']}")

    filename = sys.argv[1] if len(sys.argv) == 2 else None
    await process_requests("😀> ", filename, request_handler)

asyncio.run(main())
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
`complete` is just a function that takes a `string` and eventually returns a
string (wrapped in a `Result`) if all goes well.

For convenience, TypeChat provides two functions out of the box to connect to
the OpenAI API and Azure's OpenAI Services.
You can call these directly.

```py
def create_openai_language_model(
    api_key: str,
    model: str,
    endpoint: str = "https://api.openai.com/v1/chat/completions",
    org: str = "",
    *,
    temperature: float | None = 0.0,
):
    ...

def create_azure_openai_language_model(
    api_key: str | None,
    endpoint: str,
    *,
    token_provider: TokenProvider | None = None,
    temperature: float | None = 0.0,
): ...
```

For even more convenience, TypeChat also provides a function to infer whether
you're using OpenAI or Azure OpenAI.

```py
def create_language_model(
    vals: dict[str, str | None],
    *,
    temperature: float | None = 0.0,
) -> TypeChatLanguageModel: ...
```

With `create_language_model`, you can populate your environment variables and
pass them in.
Based on whether `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` is set, you'll get
a model of the appropriate type.

#### Using a bearer-token provider

For keyless Azure OpenAI authentication, pass `api_key=None` and an existing
token provider directly. `TokenProvider` is a callable returning either a token
string or an awaitable token string, so both synchronous and asynchronous
providers work:

```py
from typechat import create_azure_openai_language_model

model = create_azure_openai_language_model(
    api_key=None,
    endpoint=chat_completions_endpoint,
    token_provider=token_provider,
)
```

The endpoint is the full deployment Chat Completions URL, including its
`api-version` query parameter. The provider is called for every HTTP attempt,
including retries, and this authentication path sends only an `Authorization:
Bearer ...` header, not an `api-key` header. The provider owns credential
acquisition, caching, renewal, and cleanup. TypeChat does not cache tokens or
require an Azure Identity dependency.

API keys and token providers are mutually exclusive. Return the raw token without
a `Bearer ` prefix. Non-string/empty tokens and tokens containing whitespace,
control characters, or non-ASCII characters produce a fixed, credential-free
`Failure` before an authorization header is constructed or a request is sent. Provider exceptions use the
existing HTTP model retry/failure behavior; cancellation propagates.

Synchronous providers execute on the event-loop thread and should be nonblocking.
Prefer an asynchronous provider for network I/O. For an existing thread-safe
`blocking_token_provider` that returns a token string, offload it explicitly:

```py
import asyncio

async def token_provider() -> str:
    return await asyncio.to_thread(blocking_token_provider)
```

Pass this wrapper as `token_provider` to the factory. The blocking provider owns
its I/O timeouts and thread safety; cancelling the wrapper does not forcibly stop
work already running in the thread. The model's HTTP timeout does not bound token
acquisition. Do not offload providers that create loop-bound futures or otherwise
require the running event loop: pass those directly and return their awaitable.
TypeChat does not automatically move synchronous providers to a worker thread.

Existing API-key calls, positional arguments, environment-variable handling,
and legacy headers are unchanged. In particular, setting
`AZURE_OPENAI_API_KEY=identity` does not activate a credential provider.

#### Reusing an already configured client

If your application already has an `AsyncOpenAI`, `AsyncAzureOpenAI`, or
compatible asynchronous Chat Completions client, adapt that instance directly:

```py
from typechat import create_openai_language_model_from_client

model = create_openai_language_model_from_client(
    openai_client,
    model="my-model-or-azure-deployment",
)
```

The adapter uses `client.chat.completions.create` and reads
`choices[0].message.content`. It requires no environment variables and adds no
SDK dependency to TypeChat. It sends TypeChat's prompt sections with
`n=1` and `stream=False`; the caller supplies the model or Azure deployment name.
Temperature defaults to `0.0` and can be configured or omitted as described below.

Your client's endpoint, API version, authentication, retries, and timeouts
remain configured by your application. TypeChat does not reconfigure or close
the client, or add another retry/timeout layer. Client exceptions and
cancellation propagate unchanged. Missing choices or text produce a `Failure`.
The adapter is for Chat Completions, not the Responses API.

Pass either model to `TypeChatJsonTranslator` as usual. Schema generation,
validation, and repair behavior remain unchanged.

#### Configuring temperature

All four model factories accept a keyword-only `temperature: float | None`
option. Leaving it unspecified retains the existing `0.0` setting. Pass a number
to configure it, or `None` to omit the field entirely (not send JSON `null`) and
use the configured client's or service's default:

```py
model = create_azure_openai_language_model(
    api_key=None,
    endpoint=chat_completions_endpoint,
    token_provider=token_provider,
    temperature=None,
)

model = create_openai_language_model_from_client(
    openai_client,
    model="my-model-or-azure-deployment",
    temperature=None,
)
```

Omission supports reasoning models that reject explicit sampling parameters,
including models that do not support disabling reasoning. It does not set a
reasoning effort, infer model capabilities, change authentication, or switch APIs.
Other client settings, ownership, retries, and timeouts are unchanged.

#### Using OpenAI-compatible gateways

TypeChat works with any service that exposes the OpenAI Chat Completions API.
To use a gateway such as [OrcaRouter](https://www.orcarouter.ai) or OpenRouter,
point `create_openai_language_model` at the gateway's endpoint via the
`endpoint` argument:

```py
model = create_openai_language_model(
    api_key, model, endpoint="https://api.orcarouter.ai/v1/chat/completions"
)
```

With `create_language_model`, set the `OPENAI_ENDPOINT` environment variable to
the gateway's Chat Completions URL alongside `OPENAI_API_KEY` and
`OPENAI_MODEL`:

```
OPENAI_API_KEY=<your API key>
OPENAI_MODEL=<model name>
OPENAI_ENDPOINT=https://api.orcarouter.ai/v1/chat/completions
```

For example, to use [Standard Compute](https://standardcompute.com), whose
`StandardCompute` model routes each request to the cheapest enabled model that
can handle it, with automatic fallback:

```
OPENAI_API_KEY=<your Standard Compute API key, e.g. the value of STANDARDCOMPUTE_API_KEY>
OPENAI_MODEL=StandardCompute
OPENAI_ENDPOINT=https://api.stdcmpt.com/v1/chat/completions
```

The HTTP models returned by `create_language_model`,
`create_openai_language_model`, and `create_azure_openai_language_model` have a
few writable attributes you might find useful:

- `max_retry_attempts`
- `retry_pause_seconds`
- `timeout_seconds`

Though note that these are unstable.

Regardless of how you decide to construct your model, it is important to avoid committing credentials directly in source.
One way to make this work between production and development environments is to use a `.env` file in development, and specify that `.env` in your `.gitignore`.
You can use a library like [`python-dotenv`](https://pypi.org/project/python-dotenv/) to help load these up.

```py
from dotenv import load_dotenv
load_dotenv()

// ...

import typechat
model = typechat.create_language_model(os.environ)
```

## Text and image prompts

The HTTP Chat Completions models and configured-client adapter accept image
references alongside text. Use `model.complete` for text output, or supply image
context through the translator's existing `prompt_preamble` for validated data.
The calls below demonstrate both interfaces; an application can use either
independently. Replace the hosted URL with your own and pass already-base64-encoded
image data:

```py
from typing_extensions import TypedDict

from typechat import (
    PromptSection,
    Result,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
    TypeChatValidator,
)


class ImageDescription(TypedDict):
    description: str


async def inspect_images(
    model: TypeChatLanguageModel, image_base64: str
) -> tuple[Result[str], Result[ImageDescription]]:
    context: list[PromptSection] = [
        {"role": "user", "content": [
            {"type": "text", "text": "Use these images as context."},
            {"type": "image_url", "image_url": {"url": "https://example.com/photo.png"}},
            {"type": "image_url", "image_url": {
                "url": f"data:image/png;base64,{image_base64}",
                "detail": "low",
            }},
        ]},
    ]
    text = await model.complete(context)
    translator = TypeChatJsonTranslator(model, TypeChatValidator(ImageDescription), ImageDescription)
    data = await translator.translate("Describe the images.", prompt_preamble=context)
    return text, data
```

These are ordinary dictionaries, with the following public types exported by
`typechat`:

```py
from typing_extensions import Literal, NotRequired, TypeAlias, TypedDict

class TextPromptContent(TypedDict):
    type: Literal["text"]
    text: str

class ImageUrl(TypedDict):
    url: str
    detail: NotRequired[Literal["auto", "low", "high"]]

class ImagePromptContent(TypedDict):
    type: Literal["image_url"]
    image_url: ImageUrl

PromptContent: TypeAlias = str | list[TextPromptContent | ImagePromptContent]

class PromptSection(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: PromptContent
```

Whole-string content still works in every role. Lists must contain tagged
`text` or `image_url` dictionaries, not bare strings. Tagged text is supported
in system, user, and assistant messages; images are supported only in user
messages. Image references must be nonempty strings. Omit `detail` to leave it
unspecified, or use `auto`, `low`, or `high`. The models preserve message and part
ordering, exact URL/data-URL strings, and caller-owned dictionaries. Malformed
or unsupported input returns a `Failure` identifying the section or part without
echoing its content, before resolving a token or dispatching a request.

The translator's current request remains a string, and ordinary `translate(str)`
calls need no changes. Preamble messages remain before the combined schema/request
message; validation and repair keep the original context and append rejected
assistant text followed by user diagnostics. This does not adopt the alternative
prompt layout proposed in [#241](https://github.com/microsoft/TypeChat/pull/241).
Model completions remain text-only, and schema generation and strict result
validation are unchanged.

Supply a provider/model that supports images and follow its supported file formats
(for example PNG, JPEG, or WebP), accessible-URL requirements, image-count limits,
and encoded-payload, resolution, and size limits. TypeChat validates reference
structure only. It never fetches, decodes, resizes, or validates image bytes and
does not add image generation, audio/video, streaming, or Responses API support.
No new dependency is required. Existing API-key/token-provider authentication,
HTTP retries/timeouts/response-size limits, and caller-owned SDK configuration and
lifecycle remain unchanged. Custom models must handle the prompt parts they accept.

For a separate application example, see the
[contributed TypeScript image example](https://github.com/microsoft/TypeChat/pull/258).

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

Both [the built-in `typing` module](https://docs.python.org/3/library/typing.html) and [`typing_extensions`](https://pypi.org/project/typing-extensions/) are supported.
On Python 3.11, however, import `TypedDict` from `typing_extensions`: Pydantic requires it instead of `typing.TypedDict` on Python versions earlier than 3.12.
`Annotated` and `Literal` can still be imported from `typing`.

Here is a complete `TypedDict` version of `schema.py`, with a `Doc` description for the field:

```py
from typing import Annotated, Literal
from typing_extensions import Doc, TypedDict

class Sentiment(TypedDict):
    sentiment: Annotated[
        Literal["negative", "neutral", "positive"],
        Doc("The sentiment of the user input."),
    ]
```

Or use a plain string for the same field description:

```py
from typing import Annotated, Literal
from typing_extensions import TypedDict

class Sentiment(TypedDict):
    sentiment: Annotated[
        Literal["negative", "neutral", "positive"],
        "The sentiment of the user input.",
    ]
```

Either `Doc` or a plain string in `Annotated` supplies documentation to the generated TypeScript schema.
Trailing inline comments on directly declared `TypedDict` and dataclass fields also supply schema documentation when their Python source is available.
Explicit `Annotated` documentation takes precedence over inline comments, even when that explicit documentation is empty.
If source is unavailable, conversion still uses the type annotations and explicit documentation, but cannot include inline comments.

[`typing.NewType`](https://docs.python.org/3/library/typing.html#typing.NewType) (and `typing_extensions.NewType`) is also supported.
TypeChat converts a NewType through its `__supertype__`, so the TypeScript schema uses the underlying JSON type: `NewType("UserId", str)` becomes `string`, and a NewType built on another NewType follows the chain.
Runtime validation still uses the declared Python type; NewType itself does not add checks beyond that underlying type.


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
        Otherwise, returns a `Failure` with an error message and the rejected object in `value`.
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
A translator takes a language model, a validator, and our expected type, and
provides a way to translate some user input into objects following our schema.
To do so, it crafts a prompt based on the schema, reaches out to the model,
parses out JSON data, and attempts validation.
Optionally, it will craft repair prompts and retry if validation fails.

```py
translator = TypeChatJsonTranslator(model, validator, sentiment.Sentiment)
```

When we are ready to translate a user request, we can call the `translate`
method.

```ts
translator.translate("Hello world! 🙂");
```

We'll come back to this.

## Creating a "REPL"

TypeChat exports a `process_requests` function that makes it easy to
experiment with TypeChat.
Depending on its second argument, it either creates an interactive command
line (if given `None`), or reads lines from the given a file path.

```ts
async def request_handler(message: str):
    ...

filename = sys.argv[1] if len(sys.argv) == 2 else None
await process_requests("😀> ", filename, request_handler)
```

`process_requests` takes 3 things.
First, there's the prompt string - this is what a user will see before their
own input in interactive scenarios.
You can make this playful.
We like to use emoji here. 😄

Next, we take a text file name.
Input strings will be read from this file one line at a time.
If the file name was `None`, `process_requests` will work on standard input
and provide an interactive prompt (assuming `sys.stdin.isatty()` is true).
By checking `sys.argv`, our script makes our program interactive unless the
person running the program provided an input file as a command line argument
(e.g. `python ./example.py inputFile.txt`).

Finally, there's the request handler.
We'll fill that in next.

## Translating Requests

Our handler receives some user input (the `message` string) each time it's
called.
It's time to pass that string into over to our `translator` object.

```ts
async def request_handler(message: str):
    result = await translator.translate(message)
    if isinstance(result, Failure):
        print(result.message)
    else:
        print(f"The sentiment is {result.value.sentiment}")
```

We're calling the `translate` method on each string and getting a response.
If something goes wrong, TypeChat will retry requests up to a maximum
specified by `retry_max_attempts` on our `model`.
However, if the initial request as well as all retries fail, `result` will be
a `typechat.Failure` and we'll be able to grab a `message` explaining what
went wrong.

In the ideal case, `result` will be a `typechat.Success` and we'll be able to
access our well-typed `value` property!
This will correspond to the type that we passed in when we created our
translator object (i.e. `Sentiment`).

## Accessing Failed Output

A `Failure` can also provide an unvalidated `value: object` and `response_text: str | None`.
Check `has_value` before using `value`; it distinguishes missing data from a rejected `None`,
`False`, `0`, or empty string.

```py
result = await translator.translate(message)
if isinstance(result, Failure):
    original_response = result.response_text
    if result.has_value:
        rejected = result.value
        # Validate or repair this value before using it as a Sentiment.
```

Use `isinstance` with `Success` or `Failure` to distinguish outcomes, not the presence of `value`.
Validators also retain rejected inputs when used directly.
Custom validators can return `Failure(message, value=rejected, response_text=text)`, and the
translator preserves their payloads.

If automatic repair fails, TypeChat retains the latest rejected candidate and available model text,
not a full attempt history. These can refer to different attempts if the repair response could not
be parsed. A network failure before any output has no candidate value. Repair limits and successful
results are unchanged, including Python's existing repair of malformed JSON.
Rejected values and response text may contain sensitive output; do not log or serialize them blindly.

That's it!
You should now have a basic idea of TypeChat's APIs and how to get started
with a new project. 🎉
