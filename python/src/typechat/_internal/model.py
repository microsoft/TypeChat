import asyncio
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
            response: httpx.Response | None = None
            try:
                response = await self._async_client.post(
                    self.url,
                    headers=headers,
                    json=body,
                    timeout=self.timeout_seconds
                )

                if response.is_success:
                    try:
                        json_result = cast(
                            dict[Literal["choices"], list[dict[Literal["message"], PromptSection]]],
                            response.json()
                        )
                        return Success(json_result["choices"][0]["message"]["content"] or "")
                    
                    except (Exception) as e:
                        return Failure(f"Failed to parse successful API response: {str(e)}")

                if response.status_code not in _TRANSIENT_ERROR_CODES or retry_count >= self.max_retry_attempts:
                    return Failure(f"REST API error {response.status_code}: {response.reason_phrase}")

            except httpx.RequestError as e:
                if retry_count >= self.max_retry_attempts:
                    return Failure(str(e) or f"{type(e).__name__} raised from within internal TypeChat language model.")
            
            except Exception as e:
                return Failure(f"Unexpected error: {str(e) or repr(e)}")

            delay = self.retry_pause_seconds * (2 ** retry_count)
            await asyncio.sleep(delay)
            retry_count += 1

    async def aclose(self):
        await self._async_client.aclose()

    @override
    async def __aenter__(self) -> Self:
        return self

    @override
    async def __aexit__(self, __exc_type: type[BaseException] | None, __exc_value: BaseException | None, __traceback: TracebackType | None) -> bool | None:
        await self.aclose()

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
