import asyncio
import json
from types import TracebackType
from typing_extensions import AsyncContextManager, Literal, Protocol, Self, TypedDict, cast, override

from typechat._internal.result import Failure, Result, Success

import httpx

class PromptSection(TypedDict):
    """
    Represents a section of an LLM prompt with an associated role. TypeChat uses the "user" role for
    prompts it generates and the "assistant" role for previous LLM responses (which will be part of
    the prompt in repair attempts). TypeChat currently doesn't use the "system" role.
    """
    role: Literal["system", "user", "assistant"]
    content: str

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

class HttpxLanguageModel(TypeChatLanguageModel, AsyncContextManager):
    url: str
    headers: dict[str, str]
    default_params: dict[str, str]
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

    def __init__(self, url: str, headers: dict[str, str], default_params: dict[str, str]):
        super().__init__()
        self.url = url
        self.headers = headers
        self.default_params = default_params
        self._async_client = httpx.AsyncClient()

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Success[str] | Failure:
        headers = {
            "Content-Type": "application/json",
            **self.headers,
        }

        if isinstance(prompt, str):
            prompt = [{"role": "user", "content": prompt}]

        body = {
            **self.default_params,
            "messages": prompt,
            "temperature": 0.0,
            "n": 1,
        }
        retry_count = 0
        while True:
            try:
                async with self._async_client.stream(
                    "POST",
                    self.url,
                    headers=headers,
                    json=body,
                    timeout=self.timeout_seconds,
                ) as response:
                    if response.is_success:
                        raw = await self._read_capped(response)
                        json_result = cast(
                            dict[Literal["choices"], list[dict[Literal["message"], PromptSection]]],
                            json.loads(raw)
                        )
                        return Success(json_result["choices"][0]["message"]["content"] or "")

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

def create_language_model(vals: dict[str, str | None]) -> HttpxLanguageModel:
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
        org = vals.get("OPENAI_ORG", None) or ""
        return create_openai_language_model(api_key, model, endpoint, org)

    elif "AZURE_OPENAI_API_KEY" in vals:
        api_key=required_var("AZURE_OPENAI_API_KEY")
        endpoint=required_var("AZURE_OPENAI_ENDPOINT")
        return create_azure_openai_language_model(api_key, endpoint)
    else:
        raise ValueError("Missing environment variables for OPENAI_API_KEY or AZURE_OPENAI_API_KEY.")

def create_openai_language_model(api_key: str, model: str, endpoint: str = "https://api.openai.com/v1/chat/completions", org: str = "") -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an OpenAI REST API endpoint.

    Args:
        api_key: The OpenAI API key.
        model: The OpenAI model name.
        endpoint: The OpenAI REST API endpoint.
        org: The OpenAI organization.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Organization": org,
    }
    default_params = {
        "model": model,
    }
    return HttpxLanguageModel(url=endpoint, headers=headers, default_params=default_params)

def create_azure_openai_language_model(api_key: str, endpoint: str) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an Azure OpenAI REST API endpoint.

    Args:
        api_key: The Azure OpenAI API key.
        endpoint: The Azure OpenAI REST API endpoint.
    """
    headers = {
        # Needed when using managed identity
        "Authorization": f"Bearer {api_key}",
        # Needed when using regular API key
        "api-key": api_key,
    }
    return HttpxLanguageModel(url=endpoint, headers=headers, default_params={})
