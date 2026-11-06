import asyncio
import json
import subprocess
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Sequence
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass
from inspect import Parameter, signature
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from typing_extensions import Literal, NotRequired, TypedDict, cast

import httpx
import pytest
import typechat
from typechat._internal.model import HttpxLanguageModel

from .test_multimodal_model import MALFORMED_PARTS, MALFORMED_PROMPTS


Handler = Callable[[httpx.Request], httpx.Response]
MockClient = Callable[[Handler], httpx.AsyncClient]


@pytest.fixture
def mock_client(monkeypatch: pytest.MonkeyPatch) -> MockClient:
    async_client = httpx.AsyncClient

    def create(handler: Handler) -> httpx.AsyncClient:
        client = async_client(transport=httpx.MockTransport(handler))
        monkeypatch.setattr(httpx, "AsyncClient", lambda: client)
        return client

    return create


class _InputText(TypedDict):
    type: Literal["input_text", "output_text"]
    text: str


class _InputImage(TypedDict):
    type: Literal["input_image"]
    image_url: str
    detail: NotRequired[Literal["auto", "low", "high"]]


class _InputSection(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str | list[_InputText | _InputImage]


class _Request(TypedDict):
    model: str
    input: list[_InputSection]
    stream: Literal[False]


class _Responses:
    requests: list[_Request]
    _outputs: Iterator[object]

    def __init__(self, outputs: Sequence[object]):
        super().__init__()
        self.requests = []
        self._outputs = iter(outputs)

    async def create(
        self, *, model: str, input: list[_InputSection], stream: Literal[False],
    ) -> object:
        self.requests.append({"model": model, "input": deepcopy(input), "stream": stream})
        output = next(self._outputs)
        if isinstance(output, BaseException):
            raise output
        return output


@dataclass
class _Client:
    responses: _Responses
    timeout: float = 42.0
    closed: bool = False

    async def close(self) -> None:
        self.closed = True


def _message(content: object, *, status: object = "completed", role: object = "assistant") -> dict[str, object]:
    return {"type": "message", "role": role, "status": status, "content": content}


def _text(text: object) -> dict[str, object]:
    return {"type": "output_text", "text": text, "annotations": []}


def _response(text: str = "Hello!") -> dict[str, object]:
    return {
        "status": "completed",
        "output": [_message([_text(text)])],
        "error": None,
        "incomplete_details": None,
    }


def _sdk_object(value: object) -> object:
    if isinstance(value, dict):
        return SimpleNamespace(**{key: _sdk_object(item) for key, item in cast(dict[str, object], value).items()})
    if isinstance(value, list):
        return [_sdk_object(item) for item in cast(list[object], value)]
    return value


def _model(
    outputs: Sequence[object], use_client: bool, mock_client: MockClient,
    *, temperature: float | None = 0.0, token_provider: typechat.TokenProvider | None = None,
) -> tuple[typechat.TypeChatLanguageModel, list[_Request]]:
    if use_client:
        client = _Client(_Responses([_sdk_object(output) for output in outputs]))
        configured: typechat.ResponsesClient = client
        return (
            typechat.create_openai_language_model_from_client(
                configured, "my-deployment", use_responses_api=True, temperature=temperature,
            ),
            client.responses.requests,
        )
    remaining = iter(outputs)
    requests: list[_Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(cast(_Request, json.loads(request.content)))
        return httpx.Response(200, json=next(remaining))

    mock_client(handler)
    endpoint = "https://example.invalid/opaque?api-version=test"
    model = (
        typechat.create_azure_openai_language_model(
            None, endpoint, model="my-deployment", use_responses_api=True,
            token_provider=token_provider, temperature=temperature,
        )
        if token_provider is not None else
        typechat.create_openai_language_model(
            "test-key", "my-deployment", endpoint, use_responses_api=True, temperature=temperature,
        )
    )
    model.retry_pause_seconds = 0
    return model, requests


@asynccontextmanager
async def _open_model(model: typechat.TypeChatLanguageModel) -> AsyncIterator[typechat.TypeChatLanguageModel]:
    if isinstance(model, HttpxLanguageModel):
        async with model:
            yield model
    else:
        yield model


def _complete(
    model: typechat.TypeChatLanguageModel, prompt: str | list[typechat.PromptSection] = "hello",
) -> typechat.Result[str]:
    async def run() -> typechat.Result[str]:
        async with _open_model(model):
            return await model.complete(prompt)
    return asyncio.run(run())


def _image_prompts(
    url: str = "https://images.example.invalid/photo.png?ref=exact%2Fvalue",
    detail: Literal["auto", "low", "high"] | None = None,
) -> tuple[list[typechat.PromptSection], list[_InputSection]]:
    image: typechat.ImageUrl = {"url": url}
    expected_image: _InputImage = {"type": "input_image", "image_url": url}
    if detail is not None:
        image["detail"] = detail
        expected_image["detail"] = detail
    data_url = "data:image/png;base64,aW1hZ2U="
    return (
        [
            {"role": "system", "content": [{"type": "text", "text": "Follow the schema."}]},
            {"role": "user", "content": [
                {"type": "text", "text": "First image:"},
                {"type": "image_url", "image_url": image},
                {"type": "text", "text": "Second image:"},
                {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
            ]},
            {"role": "assistant", "content": [{"type": "text", "text": "Ready."}]},
        ],
        [
            {"role": "system", "content": [{"type": "input_text", "text": "Follow the schema."}]},
            {"role": "user", "content": [
                {"type": "input_text", "text": "First image:"},
                expected_image,
                {"type": "input_text", "text": "Second image:"},
                {"type": "input_image", "image_url": data_url, "detail": "high"},
            ]},
            {"role": "assistant", "content": [{"type": "output_text", "text": "Ready."}]},
        ],
    )


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("temperature", [0.0, 1.0, None])
def test_responses_preserve_text_roles_and_send_only_responses_fields(
    use_client: bool, temperature: float | None, mock_client: MockClient,
):
    model, requests = _model([_response()], use_client, mock_client, temperature=temperature)
    prompt: list[typechat.PromptSection] = [
        {"role": "system", "content": "instructions"},
        {"role": "user", "content": "question"},
        {"role": "assistant", "content": "previous answer"},
    ]
    original = [message.copy() for message in prompt]
    assert _complete(model, prompt) == typechat.Success("Hello!")
    assert requests == [{"model": "my-deployment", "input": original, "stream": False}]
    assert prompt == original


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("detail", [None, "auto", "low", "high"])
@pytest.mark.parametrize("url", [
    "https://images.example.invalid/photo.png?ref=exact%2Fvalue",
    "data:image/png;base64,aW1hZ2U=",
])
def test_responses_maps_mixed_parts_and_preserves_images_and_optional_detail(
    use_client: bool, detail: Literal["auto", "low", "high"] | None, url: str, mock_client: MockClient,
):
    model, requests = _model([_response()], use_client, mock_client)
    prompt, expected = _image_prompts(url, detail)
    original = deepcopy(prompt)
    assert _complete(model, prompt) == typechat.Success("Hello!")
    assert requests == [{"model": "my-deployment", "input": expected, "stream": False}]
    assert prompt == original


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("role, tag", [
    ("system", "input_text"), ("user", "input_text"), ("assistant", "output_text"),
])
def test_responses_tagged_text_uses_role_specific_parts(
    use_client: bool, role: Literal["system", "user", "assistant"],
    tag: Literal["input_text", "output_text"], mock_client: MockClient,
):
    model, requests = _model([_response()], use_client, mock_client)
    prompt: list[typechat.PromptSection] = [
        {"role": role, "content": [{"type": "text", "text": ""}, {"type": "text", "text": " Exact text "}]},
    ]
    original = deepcopy(prompt)
    assert _complete(model, prompt) == typechat.Success("Hello!")
    assert requests[0]["input"] == [
        {"role": role, "content": [{"type": tag, "text": ""}, {"type": tag, "text": " Exact text "}]},
    ]
    assert prompt == original


def test_responses_client_cannot_mutate_caller_owned_image_prompts(monkeypatch: pytest.MonkeyPatch):
    client = _Client(_Responses([]))
    prompt, expected = _image_prompts()
    original = deepcopy(prompt)

    async def create(*, model: str, input: list[_InputSection], stream: Literal[False]) -> object:
        assert model == "my-deployment" and stream is False
        assert input == expected
        content = input[1]["content"]
        assert isinstance(content, list)
        part = content[1]
        assert part["type"] == "input_image"
        part["image_url"] = "changed by the configured client"
        content.clear()
        input.clear()
        return _response()

    monkeypatch.setattr(client.responses, "create", create)
    model = typechat.create_openai_language_model_from_client(client, "my-deployment", use_responses_api=True)
    assert _complete(model, prompt) == typechat.Success("Hello!")
    assert prompt == original
    assert not client.closed


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("prompt, location", [
    *MALFORMED_PROMPTS,
    *[
        ([{"role": "user", "content": [part]}], "section 0, part 0")
        for part in MALFORMED_PARTS
    ],
    *[
        ([{"role": role, "content": [{"type": "image_url", "image_url": {"url": "private-image"}}]}],
         "section 0, part 0")
        for role in ("system", "assistant")
    ],
])
def test_responses_rejects_invalid_prompts_before_authentication_or_dispatch(
    use_client: bool, prompt: object, location: str, mock_client: MockClient,
):
    provider = Mock(return_value="test-token")
    model, requests = _model([], use_client, mock_client, token_provider=provider)
    result = _complete(model, cast(str | list[typechat.PromptSection], prompt))
    assert isinstance(result, typechat.Failure)
    assert location in result.message
    assert "private" not in result.message
    assert "prompt-data-must-not-leak" not in result.message
    assert "data:image" not in result.message
    assert "https://" not in result.message
    assert not result.has_value and result.response_text is None
    assert requests == []
    provider.assert_not_called()


@pytest.mark.parametrize("use_client", [False, True])
def test_normalizes_string_input_without_changing_the_selected_api(use_client: bool, mock_client: MockClient):
    model, requests = _model([_response()], use_client, mock_client)
    assert _complete(model) == typechat.Success("Hello!")
    assert requests[0]["input"] == [{"role": "user", "content": "hello"}]


@pytest.mark.parametrize("use_client", [False, True])
def test_concatenates_all_text_in_output_order_and_ignores_reasoning(use_client: bool, mock_client: MockClient):
    payload: dict[str, object] = {
        **_response(),
        "output": [
            {"type": "reasoning", "summary": [], "encrypted_content": "not text"},
            _message([_text("one"), _text("two")]),
            {"type": "reasoning", "status": "completed", "summary": []},
            _message([_text("three")]),
        ],
        "output_text": "must not override canonical output",
        "unrelated": {"future": "field"},
    }
    model, _ = _model([payload], use_client, mock_client)
    assert _complete(model) == typechat.Success("onetwothree")


@pytest.mark.parametrize("use_client", [False, True])
def test_present_empty_text_is_not_missing_text(use_client: bool, mock_client: MockClient):
    model, _ = _model([_response("")], use_client, mock_client)
    assert _complete(model) == typechat.Success("")


_INVALID_OUTPUTS: list[object] = [
    None,
    [],
    {},
    {"output_text": "not a canonical envelope"},
    {"status": "completed", "output_text": "not canonical"},
    *[{**_response(), "status": status} for status in [
        None, "failed", "incomplete", "cancelled", "in_progress", "queued", "unknown",
    ]],
    {**_response(), "error": {"message": "provider-payload-marker"}},
    {**_response(), "error": {}},
    {**_response(), "incomplete_details": {"reason": "content_filter"}},
    {**_response(), "output": None},
    {**_response(), "output": {}},
    {**_response(), "output": "not a list"},
    {**_response(), "output": []},
    {**_response(), "output": [{"type": "reasoning", "summary": []}]},
    {**_response(), "output": [None]},
    {**_response(), "output": [_message(None)]},
    {**_response(), "output": [_message([])]},
    {**_response(), "output": [_message({})]},
    {**_response(), "output": [_message([_text("partial")], status=None)]},
    {**_response(), "output": [_message([_text("partial")], status="incomplete")]},
    {**_response(), "output": [_message([_text("partial")], status="in_progress")]},
    {**_response(), "output": [_message([_text("partial")], role="user")]},
    {**_response(), "output": [_message([None])]},
    {**_response(), "output": [_message([dict[str, object]()])]},
    {**_response(), "output": [_message([{"type": "output_text"}])]},
    {**_response(), "output": [_message([_text(None)])]},
    {**_response(), "output": [_message([_text(42)])]},
    {**_response(), "output": [_message([_text("partial"), {"type": "refusal", "refusal": "provider-payload-marker"}])]},
    {**_response(), "output": [_message([_text("partial"), {"type": "blocked"}])]},
    {**_response(), "output": [_message([_text("partial"), {"type": "output_image"}])]},
    {**_response(), "output": [_message([_text("partial")]), {"type": "function_call"}]},
    {**_response(), "output": [_message([_text("partial")]), {"type": "web_search_call"}]},
    {**_response(), "output": [_message([_text("partial")]), {"type": "reasoning", "status": "incomplete"}]},
]


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("payload", _INVALID_OUTPUTS)
def test_malformed_refused_or_unsupported_output_fails_without_retry_or_fallback(
    payload: object, use_client: bool, mock_client: MockClient,
):
    model, requests = _model([payload], use_client, mock_client)
    result = _complete(model)
    assert isinstance(result, typechat.Failure)
    assert "Responses API" in result.message
    assert "provider-payload-marker" not in result.message
    assert not result.has_value
    assert result.response_text is None
    assert len(requests) == 1


def test_sdk_convenience_property_is_never_used():
    class Response:
        status = "completed"
        output: list[object] = []

        @property
        def output_text(self) -> str:
            pytest.fail("The convenience property must not bypass canonical validation.")

    client = _Client(_Responses([Response()]))
    model = typechat.create_openai_language_model_from_client(client, "model", use_responses_api=True)
    assert isinstance(_complete(model), typechat.Failure)


def test_responses_only_client_is_reused_and_remains_caller_owned():
    client = _Client(_Responses([_sdk_object(_response("first")), _sdk_object(_response("second"))]))
    model = typechat.create_openai_language_model_from_client(client, "my-deployment", use_responses_api=True)

    async def run() -> None:
        assert await model.complete("one") == typechat.Success("first")
        assert await model.complete("two") == typechat.Success("second")

    asyncio.run(run())
    assert len(client.responses.requests) == 2
    assert client.timeout == 42.0
    assert not client.closed


def test_configured_client_mappings_use_the_same_canonical_parser():
    client = _Client(_Responses([_response()]))
    model = typechat.create_openai_language_model_from_client(client, "model", use_responses_api=True)
    assert _complete(model) == typechat.Success("Hello!")


@pytest.mark.parametrize("error", [RuntimeError("client-marker"), asyncio.CancelledError()])
def test_client_exceptions_and_cancellation_propagate_without_added_retries(error: BaseException):
    client = _Client(_Responses([error]))
    model = typechat.create_openai_language_model_from_client(client, "model", use_responses_api=True)
    with pytest.raises(type(error)) as raised:
        _complete(model)
    assert raised.value is error
    assert len(client.responses.requests) == 1
    assert not client.closed


def test_client_requires_only_the_selected_api_member():
    client = _Client(_Responses([]))
    with pytest.raises(ValueError, match="chat.completions.create"):
        typechat.create_openai_language_model_from_client(client, "model")
    missing = cast(typechat.ResponsesClient, object())
    with pytest.raises(ValueError, match="responses.create"):
        typechat.create_openai_language_model_from_client(missing, "model", use_responses_api=True)


@pytest.mark.parametrize("model_name", ["", " "])
def test_client_requires_a_nonempty_model(model_name: str):
    with pytest.raises(ValueError, match="must not be empty"):
        typechat.create_openai_language_model_from_client(
            _Client(_Responses([])), model_name, use_responses_api=True,
        )


@pytest.mark.parametrize("endpoint", [
    "https://example.invalid/v1/responses",
    "https://example.invalid/openai/responses?api-version=test",
    "https://example.invalid/openai/deployments/deployment/responses?api-version=test",
    "https://example.invalid/opaque/chat/completions?route=responses&version=test",
])
@pytest.mark.parametrize("azure", [False, True])
@pytest.mark.parametrize("temperature", [0.0, 1.0, None])
def test_http_factories_preserve_complete_destinations_and_model_placement(
    endpoint: str, azure: bool, temperature: float | None, mock_client: MockClient,
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_response())

    mock_client(handler)
    model = (
        typechat.create_azure_openai_language_model(
            "literal-key", endpoint, model="deployment", use_responses_api=True, temperature=temperature,
        )
        if azure else
        typechat.create_openai_language_model(
            "literal-key", "deployment", endpoint, "org", use_responses_api=True, temperature=temperature,
        )
    )
    assert _complete(model) == typechat.Success("Hello!")
    assert str(requests[0].url) == endpoint
    assert json.loads(requests[0].content) == {
        "model": "deployment", "input": [{"role": "user", "content": "hello"}], "stream": False,
    }
    if azure:
        assert requests[0].headers["api-key"] == "literal-key"
    else:
        assert requests[0].headers["OpenAI-Organization"] == "org"


@pytest.mark.parametrize("endpoint", ["", "/responses", "not-an-address", "ftp://example.invalid/responses", "https://"])
def test_responses_requires_an_absolute_http_destination(endpoint: str):
    with pytest.raises(ValueError, match="complete HTTP or HTTPS endpoint"):
        typechat.create_openai_language_model("key", "model", endpoint, use_responses_api=True)


def test_responses_does_not_silently_use_the_chat_default_endpoint():
    with pytest.raises(ValueError, match="explicit endpoint"):
        typechat.create_openai_language_model("key", "model", use_responses_api=True)
    with pytest.raises(ValueError, match="explicit endpoint"):
        typechat.create_language_model({"OPENAI_API_KEY": "key", "OPENAI_MODEL": "model"}, use_responses_api=True)


def test_responses_selection_is_keyword_only_and_off_by_default_on_every_factory():
    for factory in [
        typechat.create_language_model, typechat.create_openai_language_model,
        typechat.create_azure_openai_language_model, typechat.create_openai_language_model_from_client,
    ]:
        parameter = signature(factory).parameters["use_responses_api"]
        assert parameter.kind == Parameter.KEYWORD_ONLY
        assert parameter.default is False


@pytest.mark.parametrize("model_name", [None, "", " "])
def test_azure_responses_requires_an_explicit_model_or_deployment(model_name: str | None):
    with pytest.raises(ValueError, match="nonempty model or deployment"):
        typechat.create_azure_openai_language_model(
            "key", "https://example.invalid/opaque", model=model_name, use_responses_api=True,
        )


@pytest.mark.parametrize("model_name", ["", " "])
def test_openai_responses_requires_a_nonempty_model(model_name: str):
    with pytest.raises(ValueError, match="nonempty model or deployment"):
        typechat.create_openai_language_model(
            "key", model_name, "https://example.invalid/responses", use_responses_api=True,
        )


@pytest.mark.parametrize("azure", [False, True])
@pytest.mark.parametrize("temperature", [0.0, 1.0, None])
def test_dictionary_factory_supports_responses_without_new_environment_names(
    azure: bool, temperature: float | None, mock_client: MockClient,
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_response())

    mock_client(handler)
    settings: dict[str, str | None] = (
        {"AZURE_OPENAI_API_KEY": "identity", "AZURE_OPENAI_ENDPOINT": "https://example.invalid/opaque?api-version=test"}
        if azure else
        {
            "OPENAI_API_KEY": "key", "OPENAI_ENDPOINT": "https://example.invalid/opaque", "OPENAI_MODEL": "model",
            "OPENAI_ORGANIZATION": "preferred-org", "OPENAI_ORG": "legacy-org", "AZURE_OPENAI_API_KEY": "ignored",
        }
    )
    model = typechat.create_language_model(
        settings, model="deployment" if azure else None, use_responses_api=True, temperature=temperature,
    )
    assert _complete(model) == typechat.Success("Hello!")
    assert json.loads(requests[0].content)["model"] == ("deployment" if azure else "model")
    assert "temperature" not in json.loads(requests[0].content)
    if azure:
        assert requests[0].headers["api-key"] == "identity"
    else:
        assert requests[0].headers["OpenAI-Organization"] == "preferred-org"
        assert "api-key" not in requests[0].headers


def test_dictionary_factory_accepts_an_explicit_openai_model_override(mock_client: MockClient):
    mock_client(lambda request: httpx.Response(200, json=_response()))
    model = typechat.create_language_model(
        {"OPENAI_API_KEY": "key", "OPENAI_ENDPOINT": "https://example.invalid/opaque", "OPENAI_MODEL": "unused"},
        model="selected", use_responses_api=True,
    )
    assert model.default_params == {"model": "selected"}
    assert _complete(model) == typechat.Success("Hello!")


def test_endpoint_spelling_does_not_change_legacy_chat_mode(mock_client: MockClient):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "legacy"}}]})

    mock_client(handler)
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/responses")
    assert _complete(model) == typechat.Success("legacy")
    assert json.loads(requests[0].content) == {
        "model": "model", "messages": [{"role": "user", "content": "hello"}], "temperature": 0.0, "n": 1,
    }


@pytest.mark.parametrize("provider_kind", ["sync", "async", "awaitable"])
@pytest.mark.parametrize("with_images", [False, True])
def test_tokens_resolve_afresh_for_responses_retries_and_completion(
    provider_kind: str, with_images: bool, mock_client: MockClient,
):
    requests: list[httpx.Request] = []
    statuses = iter([429, 500, 503, 200, 200])
    token_count = 0

    def next_token() -> str:
        nonlocal token_count
        token_count += 1
        return f"token-{token_count}"

    async def async_provider() -> str:
        await asyncio.sleep(0)
        return next_token()

    def awaitable_provider() -> Awaitable[str]:
        future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        future.set_result(next_token())
        return future

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(next(statuses), json=_response())

    mock_client(handler)
    providers: dict[str, typechat.TokenProvider] = {
        "sync": next_token, "async": async_provider, "awaitable": awaitable_provider,
    }
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/opaque", model="deployment", use_responses_api=True,
        token_provider=providers[provider_kind],
    )
    assert (model.max_retry_attempts, model.retry_pause_seconds, model.timeout_seconds, model.max_response_bytes) == (
        3, 1.0, 10, 100 * 1024 * 1024,
    )
    model.retry_pause_seconds = 0
    model.timeout_seconds = 7
    image_prompt, expected_images = _image_prompts()

    async def run() -> None:
        async with model:
            assert await model.complete(image_prompt if with_images else "first") == typechat.Success("Hello!")
            assert await model.complete(image_prompt if with_images else "second") == typechat.Success("Hello!")

    asyncio.run(run())
    assert token_count == len(requests) == 5
    assert [request.headers["Authorization"].removeprefix("Bearer ") for request in requests] == [
        f"token-{number}" for number in range(1, 6)
    ]
    assert all("api-key" not in request.headers for request in requests)
    if with_images:
        assert all(json.loads(request.content)["input"] == expected_images for request in requests)
        assert image_prompt == _image_prompts()[0]
    assert requests[0].extensions["timeout"] == {"connect": 7, "read": 7, "write": 7, "pool": 7}


@pytest.mark.parametrize("token", ["", " ", "bad token", "bad\n", "bad\u0080"])
def test_invalid_responses_tokens_fail_before_dispatch(token: str, mock_client: MockClient):
    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("An invalid token must not be sent.")

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/opaque", model="deployment",
        token_provider=lambda: token, use_responses_api=True,
    )
    assert _complete(model) == typechat.Failure(
        "Token provider must return a nonempty, header-safe bearer-token string."
    )


def test_responses_token_provider_cancellation_prevents_dispatch(mock_client: MockClient):
    async def provider() -> str:
        raise asyncio.CancelledError()

    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("Cancelled token acquisition must not dispatch.")

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/opaque", model="deployment",
        token_provider=provider, use_responses_api=True,
    )
    with pytest.raises(asyncio.CancelledError):
        _complete(model)


def test_responses_authentication_remains_mutually_exclusive():
    with pytest.raises(ValueError, match="not both"):
        typechat.create_azure_openai_language_model(
            "key", "https://example.invalid/opaque", model="deployment",
            token_provider=lambda: "token", use_responses_api=True,
        )
    with pytest.raises(ValueError, match="API key or a token provider"):
        typechat.create_azure_openai_language_model(
            None, "https://example.invalid/opaque", model="deployment", use_responses_api=True,
        )


@pytest.mark.parametrize("retry_limit", [0, 2, 3])
def test_responses_exhausts_only_the_existing_retry_allowance(retry_limit: int, mock_client: MockClient):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(503)

    mock_client(handler)
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/opaque", use_responses_api=True)
    model.max_retry_attempts = retry_limit
    model.retry_pause_seconds = 0
    assert _complete(model) == typechat.Failure("Responses API request failed with HTTP status 503.")
    assert len(requests) == retry_limit + 1


@pytest.mark.parametrize("status", [400, 401, 403, 404, 405, 422, 429, 500, 502, 503, 504])
def test_http_errors_never_switch_apis_or_expose_provider_payloads(status: int, mock_client: MockClient):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status, json={"error": {"message": "credential-or-prompt-marker"}})

    mock_client(handler)
    model = typechat.create_openai_language_model(
        "key", "model", "https://example.invalid/responses", use_responses_api=True,
    )
    model.max_retry_attempts = 1
    model.retry_pause_seconds = 0
    assert _complete(model) == typechat.Failure(f"Responses API request failed with HTTP status {status}.")
    assert len(requests) == (2 if status in [429, 500, 502, 503, 504] else 1)
    assert all("input" in json.loads(request.content) and "messages" not in json.loads(request.content) for request in requests)


@pytest.mark.parametrize("raw", [b"not JSON: private-marker", b"\xff", b'{"output":'])
def test_http_invalid_json_is_a_fixed_failure_without_a_retry(raw: bytes, mock_client: MockClient):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=raw)

    mock_client(handler)
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/responses", use_responses_api=True)
    assert _complete(model) == typechat.Failure("Responses API returned malformed JSON.")
    assert len(requests) == 1


@pytest.mark.parametrize("advertised", [False, True])
@pytest.mark.parametrize("oversized", [False, True])
def test_responses_size_limit_accepts_b_bytes_and_rejects_b_plus_one(
    advertised: bool, oversized: bool, mock_client: MockClient,
):
    body = json.dumps(_response()).encode()

    async def chunks() -> AsyncIterator[bytes]:
        yield body[:10]
        yield body[10:]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body if advertised else chunks())

    mock_client(handler)
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/responses", use_responses_api=True)
    model.max_response_bytes = len(body) - int(oversized)
    result = _complete(model)
    if oversized:
        assert isinstance(result, typechat.Failure)
        assert "maximum allowed size" in result.message
    else:
        assert result == typechat.Success("Hello!")


@pytest.mark.parametrize("limit", [0, -1])
def test_nonpositive_response_size_limits_remain_disabled(limit: int, mock_client: MockClient):
    mock_client(lambda request: httpx.Response(200, json=_response()))
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/responses", use_responses_api=True)
    model.max_response_bytes = limit
    assert _complete(model) == typechat.Success("Hello!")


@pytest.mark.parametrize("cancelled", [False, True])
def test_http_transport_failure_and_cancellation_preserve_request_bounds(cancelled: bool, mock_client: MockClient):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if cancelled:
            raise asyncio.CancelledError()
        raise httpx.ReadTimeout("private-address-or-prompt-marker", request=request)

    mock_client(handler)
    model = typechat.create_openai_language_model("key", "model", "https://example.invalid/responses", use_responses_api=True)
    model.max_retry_attempts = 0
    if cancelled:
        with pytest.raises(asyncio.CancelledError):
            _complete(model)
    else:
        assert _complete(model) == typechat.Failure("Responses API request failed.")
    assert len(requests) == 1


@dataclass
class _Value:
    value: str


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("with_images", [False, True])
def test_translator_accepts_valid_responses_without_repair(
    use_client: bool, with_images: bool, mock_client: MockClient,
):
    model, requests = _model([_response('{"value": "validated"}')], use_client, mock_client)
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Value), _Value)
    preamble, expected = _image_prompts() if with_images else ([], [])
    original = deepcopy(preamble)

    async def run() -> typechat.Result[_Value]:
        async with _open_model(model):
            return await translator.translate("get value", prompt_preamble=preamble)

    assert asyncio.run(run()) == typechat.Success(_Value("validated"))
    assert len(requests) == 1
    assert requests[0]["input"][:-1] == expected
    assert preamble == original


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("with_images", [False, True])
@pytest.mark.parametrize("initial", ['{"wrong": "field"}', '{"value":', "not JSON"])
def test_translator_validates_and_repairs_responses_without_changing_mode(
    initial: str, use_client: bool, with_images: bool, mock_client: MockClient,
):
    model, requests = _model([_response(initial), _response('{"value": "repaired"}')], use_client, mock_client)
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Value), _Value)
    preamble: list[typechat.PromptSection] = [{"role": "system", "content": "context"}]
    expected: list[_InputSection] = [{"role": "system", "content": "context"}]
    if with_images:
        preamble, expected = _image_prompts()
    original = deepcopy(preamble)

    async def run() -> None:
        async with _open_model(model):
            assert await translator.translate("get value", prompt_preamble=preamble) == typechat.Success(_Value("repaired"))

    asyncio.run(run())
    assert len(requests) == 2
    assert requests[0]["input"][:-1] == expected
    assert requests[0]["input"][-1]["role"] == "user"
    assert requests[1]["input"][:-2] == requests[0]["input"]
    assert requests[1]["input"][-2] == {"role": "assistant", "content": initial}
    assert requests[1]["input"][-1]["role"] == "user"
    assert preamble == original


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("with_images", [False, True])
def test_translator_preserves_final_failure_values_and_one_repair_default(
    use_client: bool, with_images: bool, mock_client: MockClient,
):
    model, requests = _model([_response('{"value": 123}'), _response("not JSON")], use_client, mock_client)
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Value), _Value)
    preamble, expected = _image_prompts() if with_images else ([], [])
    original = deepcopy(preamble)

    async def run() -> typechat.Result[_Value]:
        async with _open_model(model):
            return await translator.translate("get value", prompt_preamble=preamble)

    result = asyncio.run(run())
    assert isinstance(result, typechat.Failure)
    assert result.has_value and result.value == {"value": 123}
    assert result.response_text == "not JSON"
    assert len(requests) == 2
    assert all(request["input"][:len(expected)] == expected for request in requests)
    assert preamble == original


@pytest.mark.parametrize("use_client", [False, True])
@pytest.mark.parametrize("after_repair", [False, True])
@pytest.mark.parametrize("with_images", [False, True])
def test_model_output_failure_stops_translation_without_an_additional_repair(
    use_client: bool, after_repair: bool, with_images: bool, mock_client: MockClient,
):
    outputs = [_response('{"value": 123}')] if after_repair else []
    outputs.append({**_response(), "status": "incomplete"})
    model, requests = _model(outputs, use_client, mock_client)
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Value), _Value)
    preamble, expected = _image_prompts() if with_images else ([], [])
    original = deepcopy(preamble)

    async def run() -> typechat.Result[_Value]:
        async with _open_model(model):
            return await translator.translate("get value", prompt_preamble=preamble)

    result = asyncio.run(run())
    assert isinstance(result, typechat.Failure)
    assert len(requests) == (2 if after_repair else 1)
    assert all(request["input"][:len(expected)] == expected for request in requests)
    assert preamble == original
    if after_repair:
        assert result.has_value and result.value == {"value": 123}
        assert result.response_text == '{"value": 123}'
    else:
        assert not result.has_value and result.response_text is None


@pytest.mark.parametrize("use_client", [False, True])
def test_responses_rejects_malformed_image_preambles_without_repair(
    use_client: bool, mock_client: MockClient, monkeypatch: pytest.MonkeyPatch,
):
    provider = Mock(return_value="test-token")
    model, requests = _model([], use_client, mock_client, token_provider=provider)
    complete = AsyncMock(wraps=model.complete)
    monkeypatch.setattr(model, "complete", complete)
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Value), _Value)
    preamble = cast(list[typechat.PromptSection], [
        {"role": "user", "content": [{"type": "image_url", "image_url": {"url": ""}}]},
    ])

    async def run() -> typechat.Result[_Value]:
        async with _open_model(model):
            return await translator.translate("get value", prompt_preamble=preamble)

    result = asyncio.run(run())
    assert isinstance(result, typechat.Failure)
    assert "section 0, part 0" in result.message
    assert not result.has_value and result.response_text is None
    assert requests == []
    provider.assert_not_called()
    complete.assert_awaited_once()


def test_responses_import_and_protocol_need_no_provider_sdk():
    subprocess.run([
        sys.executable, "-c",
        "import sys; sys.modules['openai'] = None; sys.modules['azure'] = None; " +
        "from typechat import ResponsesClient, create_openai_language_model_from_client; " +
        "assert callable(create_openai_language_model_from_client)",
    ], check=True)
