import asyncio
from types import TracebackType
from typing_extensions import AsyncContextManager, Literal, NotRequired, Protocol, Self, TypedDict, cast, override
from urllib.parse import urlparse

from typechat._internal.result import CompletionFinishReason, CompletionInfo, Failure, Result, Success, TokenUsage

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
    # When true, uses the OpenAI Responses API (input/output) instead of Chat Completions (messages).
    use_responses_api: bool = False
    # Specifies the maximum number of retry attempts.
    max_retry_attempts: int = 3
    # Specifies the delay before retrying in milliseconds.
    retry_pause_seconds: float = 1.0
    # Specifies how long a request should wait in seconds
    # before timing out with a Failure.
    timeout_seconds = 10
    _async_client: httpx.AsyncClient

    def __init__(self, url: str, headers: dict[str, str], default_params: dict[str, str], use_responses_api: bool = False):
        super().__init__()
        self.url = url
        self.headers = headers
        self.default_params = default_params
        self.use_responses_api = use_responses_api
        self._async_client = httpx.AsyncClient()

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Success[str] | Failure:
        headers = {
            "Content-Type": "application/json",
            **self.headers,
        }

        if isinstance(prompt, str):
            prompt = [{"role": "user", "content": prompt}]

        if self.use_responses_api:
            body = {
                **self.default_params,
                "input": prompt,
                "temperature": 0.0,
            }
        else:
            body = {
                **self.default_params,
                "messages": prompt,
                "temperature": 0.0,
                "n": 1,
            }
        retry_count = 0
        while True:
            try:
                response = await self._async_client.post(
                    self.url,
                    headers=headers,
                    json=body,
                    timeout=self.timeout_seconds
                )
                if response.is_success:
                    if self.use_responses_api:
                        responses_result = cast(_ResponsesResponse, response.json())
                        return Success(_responses_text(responses_result), _completion_info_responses(responses_result))
                    json_result = cast(_ChatResponse, response.json())
                    content = json_result["choices"][0]["message"]["content"] or ""
                    return Success(content, _completion_info(json_result))

                if response.status_code not in _TRANSIENT_ERROR_CODES or retry_count >= self.max_retry_attempts:
                    return Failure(f"REST API error {response.status_code}: {response.reason_phrase}")
            except Exception as e:
                if retry_count >= self.max_retry_attempts:
                    return Failure(str(e) or f"{repr(e)} raised from within internal TypeChat language model.")

            await asyncio.sleep(self.retry_pause_seconds)
            retry_count += 1

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

class _PromptTokensDetails(TypedDict, total=False):
    cached_tokens: int

class _CompletionTokensDetails(TypedDict, total=False):
    reasoning_tokens: int

class _ResponseUsage(TypedDict, total=False):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    prompt_tokens_details: _PromptTokensDetails
    completion_tokens_details: _CompletionTokensDetails

class _ResponseChoice(TypedDict):
    message: PromptSection
    finish_reason: NotRequired[str | None]

class _ChatResponse(TypedDict):
    choices: list[_ResponseChoice]
    model: NotRequired[str]
    usage: NotRequired[_ResponseUsage]

def _completion_info(json_result: _ChatResponse) -> CompletionInfo:
    """
    Builds a `CompletionInfo` from an OpenAI Chat Completions response body, normalizing token usage
    and the finish reason and attaching the raw response body for any provider-specific fields.
    """
    usage: TokenUsage | None = None
    usage_raw = json_result.get("usage")
    if usage_raw is not None:
        prompt_details = usage_raw.get("prompt_tokens_details")
        completion_details = usage_raw.get("completion_tokens_details")
        usage = TokenUsage(
            prompt_tokens=usage_raw.get("prompt_tokens", 0),
            completion_tokens=usage_raw.get("completion_tokens", 0),
            total_tokens=usage_raw.get("total_tokens", 0),
            cached_prompt_tokens=prompt_details.get("cached_tokens") if prompt_details is not None else None,
            reasoning_tokens=completion_details.get("reasoning_tokens") if completion_details is not None else None,
        )

    choices = json_result.get("choices")
    finish_reason: CompletionFinishReason | None = None
    if choices:
        finish_reason = _normalize_chat_finish_reason(choices[0].get("finish_reason"))

    return CompletionInfo(
        model=json_result.get("model"),
        usage=usage,
        finish_reason=finish_reason,
        raw=cast(dict[str, object], json_result),
    )

def _normalize_chat_finish_reason(reason: object) -> CompletionFinishReason | None:
    """
    Maps a Chat Completions `finish_reason` to a normalized `CompletionFinishReason`, or `None` when
    the API omits it.
    """
    if reason == "stop":
        return "stop"
    if reason == "length":
        return "length"
    if reason == "content_filter":
        return "content_filter"
    if reason in ("tool_calls", "function_call"):
        return "tool_calls"
    if reason is None:
        return None
    return "other"

class _ResponsesOutputContent(TypedDict, total=False):
    type: str
    text: str

class _ResponsesOutputItem(TypedDict, total=False):
    type: str
    role: str
    content: list[_ResponsesOutputContent]

class _ResponsesUsage(TypedDict, total=False):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    input_tokens_details: _PromptTokensDetails
    output_tokens_details: _CompletionTokensDetails

class _IncompleteDetails(TypedDict, total=False):
    reason: str | None

class _ResponsesResponse(TypedDict, total=False):
    model: str
    status: str
    output: list[_ResponsesOutputItem]
    usage: _ResponsesUsage
    incomplete_details: _IncompleteDetails

def _responses_text(json_result: _ResponsesResponse) -> str:
    """Extracts the assistant text from an OpenAI Responses API response body."""
    output = json_result.get("output")
    if output:
        for item in output:
            if item.get("type") == "message":
                content = item.get("content")
                if content:
                    for part in content:
                        if part.get("type") == "output_text":
                            text = part.get("text")
                            if text is not None:
                                return text
    return ""

def _completion_info_responses(json_result: _ResponsesResponse) -> CompletionInfo:
    """
    Builds a `CompletionInfo` from an OpenAI Responses API response body, normalizing token usage
    and the finish reason and attaching the raw response body for any provider-specific fields.
    """
    usage: TokenUsage | None = None
    usage_raw = json_result.get("usage")
    if usage_raw is not None:
        input_details = usage_raw.get("input_tokens_details")
        output_details = usage_raw.get("output_tokens_details")
        usage = TokenUsage(
            prompt_tokens=usage_raw.get("input_tokens", 0),
            completion_tokens=usage_raw.get("output_tokens", 0),
            total_tokens=usage_raw.get("total_tokens", 0),
            cached_prompt_tokens=input_details.get("cached_tokens") if input_details is not None else None,
            reasoning_tokens=output_details.get("reasoning_tokens") if output_details is not None else None,
        )

    incomplete = json_result.get("incomplete_details")
    incomplete_reason = incomplete.get("reason") if incomplete is not None else None

    return CompletionInfo(
        model=json_result.get("model"),
        usage=usage,
        finish_reason=_normalize_responses_finish_reason(json_result.get("status"), incomplete_reason),
        raw=cast(dict[str, object], json_result),
    )

def _normalize_responses_finish_reason(status: object, incomplete_reason: object) -> CompletionFinishReason | None:
    """
    Maps a Responses API `status` (and optional `incomplete_details.reason`) to a normalized
    `CompletionFinishReason`, or `None` when the API omits the status.
    """
    if status == "completed":
        return "stop"
    if status == "incomplete":
        if incomplete_reason == "max_output_tokens":
            return "length"
        if incomplete_reason == "content_filter":
            return "content_filter"
        return "other"
    if status is None:
        return None
    return "other"

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

def _endpoint_targets_responses(url: str) -> bool:
    """Returns True when the given endpoint URL targets the OpenAI Responses API (path ends with `/responses`)."""
    if not url:
        return False
    try:
        path = urlparse(url).path
    except ValueError:
        path = url.split("?", 1)[0]
    return path.rstrip("/").endswith("/responses")

def _build_responses_endpoint(url: str) -> str:
    """Rewrites a Chat Completions endpoint to the sibling Responses endpoint, or appends `/responses`."""
    if _endpoint_targets_responses(url):
        return url
    marker = "chat/completions"
    index = url.find(marker)
    if index >= 0:
        return url[:index] + "responses" + url[index + len(marker):]
    return url.rstrip("/") + "/responses"

def create_openai_language_model(api_key: str, model: str, endpoint: str = "https://api.openai.com/v1/chat/completions", org: str = "", use_responses_api: bool | None = None) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an OpenAI REST API endpoint.

    Args:
        api_key: The OpenAI API key.
        model: The OpenAI model name.
        endpoint: The OpenAI REST API endpoint.
        org: The OpenAI organization.
        use_responses_api: Selects the OpenAI API variant. When True, the Responses API is used; when
            False, the Chat Completions API is used. When None (default), the variant is inferred from
            the endpoint URL (a path ending in `/responses` selects the Responses API).
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Organization": org,
    }
    default_params = {
        "model": model,
    }
    use_responses = use_responses_api if use_responses_api is not None else _endpoint_targets_responses(endpoint)
    if use_responses:
        endpoint = _build_responses_endpoint(endpoint)
    return HttpxLanguageModel(url=endpoint, headers=headers, default_params=default_params, use_responses_api=use_responses)

def create_azure_openai_language_model(api_key: str, endpoint: str, use_responses_api: bool | None = None) -> HttpxLanguageModel:
    """
    Creates a language model encapsulation of an Azure OpenAI REST API endpoint.

    Args:
        api_key: The Azure OpenAI API key.
        endpoint: The Azure OpenAI REST API endpoint.
        use_responses_api: Selects the API variant. When None (default), the variant is inferred from
            the endpoint URL (a path ending in `/responses` selects the Responses API).
    """
    headers = {
        # Needed when using managed identity
        "Authorization": f"Bearer {api_key}",
        # Needed when using regular API key
        "api-key": api_key,
    }
    use_responses = use_responses_api if use_responses_api is not None else _endpoint_targets_responses(endpoint)
    return HttpxLanguageModel(url=endpoint, headers=headers, default_params={}, use_responses_api=use_responses)
