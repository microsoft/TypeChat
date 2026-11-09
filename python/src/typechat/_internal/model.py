import asyncio
import json
import re
from collections.abc import Awaitable, Callable, Sequence
from copy import deepcopy
from inspect import isawaitable
from types import TracebackType
from typing_extensions import (
    AsyncContextManager, Literal, NotRequired, Protocol, Self, TypeAlias, TypedDict, cast, override,
)

from typechat._internal.result import Failure, Result, Success

import httpx

class TextPromptContent(TypedDict):
    type: Literal["text"]
    text: str

class ImageUrl(TypedDict):
    """A hosted image or data URL; image contents and provider limits are caller-owned."""
    url: str
    detail: NotRequired[Literal["auto", "low", "high"]]

class ImagePromptContent(TypedDict):
    type: Literal["image_url"]
    image_url: ImageUrl

PromptContent: TypeAlias = str | list[TextPromptContent | ImagePromptContent]

class PromptSection(TypedDict):
    """
    Represents a section of an LLM prompt with an associated role. TypeChat uses the "user" role for
    prompts it generates and the "assistant" role for previous LLM responses (which will be part of
    the prompt in repair attempts). TypeChat currently doesn't use the "system" role.
    """
    role: Literal["system", "user", "assistant"]
    content: PromptContent

def _normalize_prompt(prompt: object) -> Result[list[PromptSection]]:
    if isinstance(prompt, str):
        return Success([{"role": "user", "content": prompt}])
    if not isinstance(prompt, list):
        return Failure("Prompt must be a string or a list of prompt sections.")

    for section_index, section in enumerate(cast(list[object], prompt)):
        location = f"Prompt section {section_index}"
        if not isinstance(section, dict):
            return Failure(f"{location} must be a prompt-section dictionary.")
        fields = cast(dict[object, object], section)
        role = fields.get("role")
        if not isinstance(role, str) or role not in ("system", "user", "assistant"):
            return Failure(f"{location} must have a supported role.")
        content = fields.get("content")
        if isinstance(content, str):
            continue
        if not isinstance(content, list):
            return Failure(f"{location} content must be a string or a list of tagged parts.")

        for part_index, part in enumerate(cast(list[object], content)):
            part_location = f"{location}, part {part_index}"
            if not isinstance(part, dict):
                return Failure(f"{part_location} must be a tagged text or image_url dictionary.")
            part_fields = cast(dict[object, object], part)
            part_type = part_fields.get("type")
            if not isinstance(part_type, str):
                return Failure(f"{part_location} must have a supported type tag.")
            if part_type == "text":
                if not isinstance(part_fields.get("text"), str):
                    return Failure(f"{part_location} text must be a string.")
            elif part_type == "image_url":
                if role != "user":
                    return Failure(f"{part_location}: images are only supported in user messages.")
                image = part_fields.get("image_url")
                if not isinstance(image, dict):
                    return Failure(f"{part_location} image_url must be a dictionary.")
                image_fields = cast(dict[object, object], image)
                url = image_fields.get("url")
                if not isinstance(url, str) or not url:
                    return Failure(f"{part_location} image_url.url must be a nonempty string.")
                if "detail" in image_fields:
                    detail = image_fields["detail"]
                    if not isinstance(detail, str) or detail not in ("auto", "low", "high"):
                        return Failure(f"{part_location} image_url.detail must be auto, low, or high.")
            else:
                return Failure(f"{part_location} must have a supported type tag.")

    return Success(deepcopy(cast(list[PromptSection], prompt)))

TokenProvider = Callable[[], str | Awaitable[str]]

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

class _ClientMessage(Protocol):
    @property
    def content(self) -> str | None: ...

class _ClientChoice(Protocol):
    @property
    def message(self) -> _ClientMessage: ...

class _ClientCompletion(Protocol):
    @property
    def choices(self) -> Sequence[_ClientChoice]: ...

class _ClientCompletions(Protocol):
    @property
    def create(self) -> Callable[..., Awaitable[_ClientCompletion]]:
        # SDK methods have overloaded parameters; require the awaited response shape.
        ...

class _ClientChat(Protocol):
    @property
    def completions(self) -> _ClientCompletions: ...

class ChatCompletionClient(Protocol):
    """An asynchronous OpenAI-compatible Chat Completions client supplied by the caller."""
    @property
    def chat(self) -> _ClientChat: ...

class _ClientLanguageModel(TypeChatLanguageModel):
    _client: ChatCompletionClient
    _model: str
    _temperature: float | None

    def __init__(self, client: ChatCompletionClient, model: str, temperature: float | None):
        super().__init__()
        self._client = client
        self._model = model
        self._temperature = temperature

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Result[str]:
        normalized = _normalize_prompt(prompt)
        if isinstance(normalized, Failure):
            return normalized
        temperature_options = {"temperature": self._temperature} if self._temperature is not None else {}
        completion = await self._client.chat.completions.create(
            model=self._model,
            messages=normalized.value,
            **temperature_options,
            n=1,
            stream=False,
        )
        if not completion.choices:
            return Failure("Client completion returned no choices.")
        content = completion.choices[0].message.content
        if not isinstance(content, str):
            return Failure("Client completion returned no text content.")
        return Success(content)

def create_openai_language_model_from_client(
    client: ChatCompletionClient,
    model: str,
    *,
    temperature: float | None = 0.0,
) -> TypeChatLanguageModel:
    """
    Adapts an already configured asynchronous OpenAI-compatible Chat Completions client.

    TypeChat does not import an SDK, reconfigure or close the client, or add retries or timeouts.
    Exceptions raised by the client propagate unchanged. The caller supplies the model name,
    or the deployment name for Azure OpenAI.
    Temperature defaults to 0.0; pass None to omit it and use the client's or service's default.
    """
    if not model.strip():
        raise ValueError("The client model or deployment name must not be empty.")
    return _ClientLanguageModel(client, model, temperature)

_TRANSIENT_ERROR_CODES = [
    429,
    500,
    502,
    503,
    504,
]

class _ResponseTooLargeError(Exception):
    """Raised when a model response body exceeds the configured maximum size."""
    def __init__(self, max_bytes: int):
        super().__init__(f"REST API response exceeded the maximum allowed size of {max_bytes} bytes")

class _HttpResponseMessage(TypedDict):
    content: object

class HttpxLanguageModel(TypeChatLanguageModel, AsyncContextManager):
    url: str
    headers: dict[str, str]
    default_params: dict[str, str]
    temperature: float | None
    # Specifies the maximum number of retry attempts.
    max_retry_attempts: int = 3
    # Specifies the delay before retrying in milliseconds.
    retry_pause_seconds: float = 1.0
    # Specifies how long a request should wait in seconds
    # before timing out with a Failure.
    timeout_seconds = 10
    # Specifies the maximum size, in bytes, of a response body that will be read from the
    # model endpoint (the default is 100 MB). A larger response is rejected without being fully
    # buffered in memory, preventing a malicious or malfunctioning endpoint from exhausting memory.
    # Set to 0 or a negative value to disable the limit.
    max_response_bytes: int = 100 * 1024 * 1024
    _async_client: httpx.AsyncClient
    _token_provider: TokenProvider | None

    def __init__(
        self,
        url: str,
        headers: dict[str, str],
        default_params: dict[str, str],
        *,
        token_provider: TokenProvider | None = None,
        temperature: float | None = 0.0,
    ):
        super().__init__()
        self.url = url
        self.headers = headers
        self.default_params = default_params
        self._token_provider = token_provider
        self.temperature = temperature
        self._async_client = httpx.AsyncClient()

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Success[str] | Failure:
        normalized = _normalize_prompt(prompt)
        if isinstance(normalized, Failure):
            return normalized
        headers = {
            "Content-Type": "application/json",
            **self.headers,
        }

        body = {
            **self.default_params,
            "messages": normalized.value,
            "temperature": self.temperature,
            "n": 1,
        }
        if self.temperature is None:
            del body["temperature"]
        retry_count = 0
        while True:
            try:
                request_headers = headers
                if self._token_provider is not None:
                    token = self._token_provider()
                    if isawaitable(token):
                        token = await token
                    if not isinstance(token, str) or re.fullmatch(r"[\x21-\x7e]+", token) is None:
                        return Failure("Token provider must return a nonempty, header-safe bearer-token string.")
                    request_headers = {**headers, "Authorization": f"Bearer {token}"}
                async with self._async_client.stream(
                    "POST",
                    self.url,
                    headers=request_headers,
                    json=body,
                    timeout=self.timeout_seconds,
                ) as response:
                    if response.is_success:
                        raw = await self._read_capped(response)
                        json_result = cast(
                            dict[Literal["choices"], list[dict[Literal["message"], _HttpResponseMessage]]],
                            json.loads(raw)
                        )
                        content = json_result["choices"][0]["message"]["content"]
                        if content is None:
                            return Success("")
                        if not isinstance(content, str):
                            return Failure("REST API completion returned non-text content.")
                        return Success(content)

                    if response.status_code not in _TRANSIENT_ERROR_CODES or retry_count >= self.max_retry_attempts:
                        return Failure(f"REST API error {response.status_code}: {response.reason_phrase}")
            except _ResponseTooLargeError as e:
                return Failure(str(e))
            except Exception as e:
                if retry_count >= self.max_retry_attempts:
                    return Failure(str(e) or f"{repr(e)} raised from within internal TypeChat language model.")

            await asyncio.sleep(self.retry_pause_seconds)
            retry_count += 1

    async def _read_capped(self, response: httpx.Response) -> bytes:
        """
        Reads a response body while enforcing `max_response_bytes`. The body is read incrementally
        and the read is aborted as soon as the accumulated size exceeds the limit, so an oversized
        response is never fully buffered in memory. A non-positive limit disables the check.
        """
        max_bytes = self.max_response_bytes
        if max_bytes <= 0:
            return await response.aread()

        # Fail fast when the server advertises an oversized body up front.
        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                advertised = int(content_length)
            except ValueError:
                advertised = None
            if advertised is not None and advertised > max_bytes:
                raise _ResponseTooLargeError(max_bytes)

        buffer = bytearray()
        async for chunk in response.aiter_bytes():
            buffer.extend(chunk)
            if len(buffer) > max_bytes:
                raise _ResponseTooLargeError(max_bytes)
        return bytes(buffer)

    @override
    async def __aenter__(self) -> Self:
        return self

    @override
    async def __aexit__(self, __exc_type: type[BaseException] | None, __exc_value: BaseException | None, __traceback: TracebackType | None) -> bool | None:
        await self._async_client.aclose()

    def __del__(self):
        try:
            asyncio.get_running_loop().create_task(self._async_client.aclose())
        except Exception:
            pass

def create_language_model(
    vals: dict[str, str | None],
    *,
    temperature: float | None = 0.0,
) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
    chosen by a dictionary of variables (typically just `os.environ`).

    If an `OPENAI_API_KEY` environment variable exists, an OpenAI model is constructed.
    The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables must also be defined or an error will be raised.

    If an `AZURE_OPENAI_API_KEY` environment variable exists, an Azure OpenAI model is constructed.
    The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined or an exception will be thrown.

    If none of these key variables are defined, an exception is thrown.
    @returns An instance of `TypeChatLanguageModel`.

    Args:
        vals: A dictionary of variables. Typically just `os.environ`.
        temperature: Sampling temperature, defaulting to 0.0. None omits the request parameter.
    """
    
    def required_var(name: str) -> str:
        val = vals.get(name, None)
        if val is None:
            raise ValueError(f"Missing environment variable {name}.")
        return val

    if "OPENAI_API_KEY" in vals:
        api_key = required_var("OPENAI_API_KEY")
        model = required_var("OPENAI_MODEL")
        endpoint = vals.get("OPENAI_ENDPOINT", None) or "https://api.openai.com/v1/chat/completions"
        org = vals.get("OPENAI_ORGANIZATION", None) or vals.get("OPENAI_ORG", None) or ""
        return create_openai_language_model(api_key, model, endpoint, org, temperature=temperature)

    elif "AZURE_OPENAI_API_KEY" in vals:
        api_key=required_var("AZURE_OPENAI_API_KEY")
        endpoint=required_var("AZURE_OPENAI_ENDPOINT")
        return create_azure_openai_language_model(api_key, endpoint, temperature=temperature)
    else:
        raise ValueError("Missing environment variables for OPENAI_API_KEY or AZURE_OPENAI_API_KEY.")

def create_openai_language_model(
    api_key: str,
    model: str,
    endpoint: str = "https://api.openai.com/v1/chat/completions",
    org: str = "",
    *,
    temperature: float | None = 0.0,
) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an OpenAI REST API endpoint.

    Args:
        api_key: The OpenAI API key.
        model: The OpenAI model name.
        endpoint: The OpenAI REST API endpoint.
        org: The OpenAI organization.
        temperature: Sampling temperature, defaulting to 0.0. None omits the request parameter.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Organization": org,
    }
    default_params = {
        "model": model,
    }
    return HttpxLanguageModel(
        url=endpoint, headers=headers, default_params=default_params, temperature=temperature,
    )

def create_azure_openai_language_model(
    api_key: str | None,
    endpoint: str,
    *,
    token_provider: TokenProvider | None = None,
    temperature: float | None = 0.0,
) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an Azure OpenAI REST API endpoint.

    Args:
        api_key: The Azure OpenAI API key, or None when using a token provider.
        endpoint: The Azure OpenAI REST API endpoint.
        token_provider: An optional synchronous or asynchronous bearer-token provider.
            Invoked for each request attempt; the provider is responsible for caching and renewal.
        temperature: Sampling temperature, defaulting to 0.0. None omits the request parameter.
    """
    if token_provider is not None:
        if api_key is not None:
            raise ValueError("Specify either an API key or a token provider, not both.")
        return HttpxLanguageModel(
            url=endpoint, headers={}, default_params={}, token_provider=token_provider, temperature=temperature,
        )
    if api_key is None:
        raise ValueError("Specify an API key or a token provider.")
    headers = {
        # Needed when using managed identity
        "Authorization": f"Bearer {api_key}",
        # Needed when using regular API key
        "api-key": api_key,
    }
    return HttpxLanguageModel(url=endpoint, headers=headers, default_params={}, temperature=temperature)
