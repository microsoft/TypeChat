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
    endpoint: str | None = None,
    org: str = "",
    *,
    use_responses_api: bool = False,
):
    ...

def create_azure_openai_language_model(
    api_key: str | None,
    endpoint: str,
    *,
    token_provider: TokenProvider | None = None,
    use_responses_api: bool = False,
    model: str | None = None,
): ...
```

For even more convenience, TypeChat also provides a function to infer whether
you're using OpenAI or Azure OpenAI.

```py
def create_language_model(
    vals: dict[str, str | None],
    *,
    use_responses_api: bool = False,
    model: str | None = None,
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
`temperature=0.0`, `n=1`, and `stream=False`; the caller supplies the model or
Azure deployment name.

Your client's endpoint, API version, authentication, retries, and timeouts
remain configured by your application. TypeChat does not reconfigure or close
the client, or add another retry/timeout layer. Client exceptions and
cancellation propagate unchanged. Missing choices or text produce a `Failure`.
These are the default Chat Completions settings. To use the client's Responses
API instead, select it explicitly as shown below.

Pass either model to `TypeChatJsonTranslator` as usual. Schema generation,
validation, and repair behavior remain unchanged.

#### Using the Responses API

For new text-only integrations, select Responses explicitly with
`use_responses_api=True`. All existing calls still default to Chat Completions;
the OpenAI factory's omitted endpoint still resolves to
`https://api.openai.com/v1/chat/completions`. No API is inferred from a URL.

The HTTP path requires the **complete Responses destination** and an explicit
model or deployment name:

```py
from typechat import create_openai_language_model

async with create_openai_language_model(
    api_key,
    model="my-model",
    endpoint="https://api.openai.com/v1/responses",
    use_responses_api=True,
) as model:
    translator = TypeChatJsonTranslator(model, validator, target_type)
    result = await translator.translate("Classify this request")
```

For Azure, use `create_azure_openai_language_model` with
`use_responses_api=True` and `model="my-deployment"`. Either an API key or the
existing `api_key=None, token_provider=token_provider` authentication works.
Supply the exact Responses URL supported by your Azure resource and API
version. OpenAI-compatible routes, Azure deployment-scoped/query-versioned
routes, and opaque proxy destinations are passed through without rewriting
paths, queries, or model names. Not every provider or Azure API version
supports Responses; TypeChat does not probe endpoint capabilities.

`create_language_model(settings, use_responses_api=True)` uses the existing
`OPENAI_ENDPOINT`, `OPENAI_MODEL`, and API-key/organization settings.
For Azure, use the existing `AZURE_OPENAI_ENDPOINT` and API key and pass
`model="my-deployment"` explicitly. The optional `model` keyword also overrides
`OPENAI_MODEL`; no new environment-variable names are required.

To reuse a configured asynchronous Responses client:

```py
from typechat import create_openai_language_model_from_client

model = create_openai_language_model_from_client(
    openai_client,
    model="my-model-or-azure-deployment",
    use_responses_api=True,
)
translator = TypeChatJsonTranslator(model, validator, target_type)
result = await translator.translate("Classify this request")
```

The exported structural `ResponsesClient` protocol requires only
`client.responses.create`; a Chat-only client still needs only the unchanged
`ChatCompletionClient` contract in default mode. No SDK import or TypeChat
environment configuration is needed. The supplied instance owns authentication,
base URL, API version, transport limits, retries, and cleanup. Exceptions and
cancellation propagate unchanged; TypeChat adds no client retries or timeouts.

Both paths send `input`, `model`, and `stream=False`, not Chat Completions'
`messages`, `temperature`, or `n`. String prompts and ordered text-only
system/user/assistant sections are supported. Images, tools, streaming, and
remote conversation-state management are outside this integration.

Responses must have a completed canonical envelope and completed assistant
messages. Ordered `output_text` parts are concatenated; known reasoning items
do not contribute text. An explicitly empty text string is allowed, but missing
or malformed content, refusals/blocking, incomplete/failed/nonterminal responses,
and unsupported output (including tool calls) return a fixed, payload-free
`Failure`, even alongside partial text. A client's convenience `output_text`
property cannot bypass these checks. A successful model completion still goes
through TypeChat's normal JSON/schema validation and bounded repair.

HTTP models retain three retries, a one-second retry pause, a ten-second timeout,
and a 100 MiB response limit by default, including incremental response-size
checks. These controls remain configurable. Token providers run afresh on each
attempt; cancellation propagates. HTTP failures do not expose raw provider
payloads, and malformed Responses output does not cause a retry.

Automatic Responses-to-Chat fallback is deferred: there is no switch, URL
inference, capability cache, or extra fallback request. Keep using default Chat
Completions mode for services that do not support Responses.

See the [runnable Responses example](https://github.com/microsoft/TypeChat/blob/main/python/examples/responses/demo.py)
for a standalone HTTP call and a function accepting an application-owned client.

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

The HTTP models returned by `create_language_model`,
`create_openai_language_model`, and `create_azure_openai_language_model` have a
few writable attributes you might find useful:

- `max_retry_attempts`
- `retry_pause_seconds`
- `timeout_seconds`
- `max_response_bytes`

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
