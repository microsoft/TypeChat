import asyncio
import json
from collections.abc import Iterator, Sequence
from copy import deepcopy
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from typing_extensions import Literal, Protocol, cast

import typechat
from typechat._internal.model import HttpxLanguageModel

from .test_prompt_types import inspect_images


_ENDPOINT = "https://example.invalid/chat/completions"
_HOSTED_IMAGE = "https://images.example.invalid/private-image.png"
_DATA_IMAGE = "data:image/png;base64,cHJpdmF0ZS1pbWFnZQ=="
_PRIVATE_TEXT = "prompt-data-must-not-leak"


@dataclass
class _ModelHarness:
    model: typechat.TypeChatLanguageModel
    prompts: list[list[typechat.PromptSection]]
    provider: Mock
    client: Mock | None
    http_model: HttpxLanguageModel | None
    http_requests: list[httpx.Request]
    mode: str


class ModelFactory(Protocol):
    def __call__(
        self, responses: Sequence[object], *, temperature: float | None = 0.0,
    ) -> _ModelHarness: ...


@pytest.fixture(params=["http-key", "http-token", "client"])
def model_factory(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[ModelFactory]:
    async_client = httpx.AsyncClient
    models_to_close: list[HttpxLanguageModel] = []
    mode = cast(str, request.param)

    def create(responses: Sequence[object], *, temperature: float | None = 0.0) -> _ModelHarness:
        remaining = iter(responses)
        prompts: list[list[typechat.PromptSection]] = []
        http_requests: list[httpx.Request] = []
        provider = Mock(return_value="test-token")
        client: Mock | None = None
        http_model: HttpxLanguageModel | None = None
        model: typechat.TypeChatLanguageModel

        if mode == "client":
            configured_temperature = temperature

            async def complete(
                *,
                model: str,
                messages: list[typechat.PromptSection],
                n: int,
                stream: Literal[False],
                temperature: float | None = None,
            ) -> SimpleNamespace:
                assert (model, temperature, n, stream) == ("test-deployment", configured_temperature, 1, False)
                prompts.append(deepcopy(messages))
                response = next(remaining)
                if isinstance(response, BaseException):
                    raise response
                choices = [] if isinstance(response, typechat.Failure) else [
                    SimpleNamespace(message=SimpleNamespace(content=response))
                ]
                return SimpleNamespace(choices=choices)

            client = Mock(timeout=42.0)
            client.chat.completions.create = AsyncMock(side_effect=complete)
            model = typechat.create_openai_language_model_from_client(
                client, "test-deployment", temperature=temperature,
            )
        else:
            def handler(request: httpx.Request) -> httpx.Response:
                assert str(request.url) == _ENDPOINT
                http_requests.append(request)
                prompts.append(cast(list[typechat.PromptSection], json.loads(request.content)["messages"]))
                response = next(remaining)
                if isinstance(response, BaseException):
                    raise response
                if isinstance(response, httpx.Response):
                    return response
                if isinstance(response, typechat.Failure):
                    return httpx.Response(400)
                return httpx.Response(200, json={"choices": [{"message": {"content": response}}]})

            transport_client = async_client(transport=httpx.MockTransport(handler))
            monkeypatch.setattr(httpx, "AsyncClient", lambda: transport_client)
            if mode == "http-token":
                http_model = typechat.create_azure_openai_language_model(
                    None, _ENDPOINT, token_provider=provider, temperature=temperature,
                )
            else:
                http_model = typechat.create_azure_openai_language_model(
                    "test-api-key", _ENDPOINT, temperature=temperature,
                )
            http_model.retry_pause_seconds = 0
            models_to_close.append(http_model)
            model = http_model

        return _ModelHarness(model, prompts, provider, client, http_model, http_requests, mode)

    yield create
    for model in models_to_close:
        asyncio.run(model.__aexit__(None, None, None))


def _image_context() -> list[typechat.PromptSection]:
    return [
        {"role": "system", "content": [{"type": "text", "text": "Follow the schema."}]},
        {"role": "user", "content": [
            {"type": "text", "text": "First image:"},
            {"type": "image_url", "image_url": {"url": _HOSTED_IMAGE}},
            {"type": "text", "text": "Second image:"},
            {"type": "image_url", "image_url": {"url": _DATA_IMAGE, "detail": "high"}},
        ]},
        {"role": "assistant", "content": [{"type": "text", "text": "Ready."}]},
    ]


@pytest.mark.parametrize("prompt", [
    "existing string prompt",
    "",
    [],
    [
        {"role": "system", "content": "Instructions"},
        {"role": "user", "content": "Question"},
        {"role": "assistant", "content": "Previous answer"},
    ],
    [
        {"role": role, "content": [{"type": "text", "text": ""}, {"type": "text", "text": "Text"}]}
        for role in ("system", "user", "assistant")
    ],
])
def test_preserves_existing_strings_and_tagged_text(
    model_factory: ModelFactory,
    prompt: str | list[typechat.PromptSection],
):
    harness = model_factory(["reply"])
    original = deepcopy(prompt)
    assert asyncio.run(harness.model.complete(prompt)) == typechat.Success("reply")
    expected = [{"role": "user", "content": prompt}] if isinstance(prompt, str) else prompt
    assert harness.prompts == [expected]
    assert prompt == original


@pytest.mark.parametrize("url", [_HOSTED_IMAGE, _DATA_IMAGE])
@pytest.mark.parametrize("detail", [None, "auto", "low", "high"])
def test_preserves_image_references_details_and_order(
    model_factory: ModelFactory,
    url: str,
    detail: Literal["auto", "low", "high"] | None,
):
    image: typechat.ImageUrl = {"url": url}
    if detail is not None:
        image["detail"] = detail
    prompt = _image_context()
    prompt.append({"role": "user", "content": [
        {"type": "text", "text": "Another image:"},
        {"type": "image_url", "image_url": image},
        {"type": "text", "text": "Describe it."},
    ]})
    original = deepcopy(prompt)
    harness = model_factory(["reply"])

    assert asyncio.run(harness.model.complete(prompt)) == typechat.Success("reply")
    assert harness.prompts == [original]
    assert prompt == original
    if harness.mode == "http-token":
        harness.provider.assert_called_once_with()
        assert "api-key" not in harness.http_requests[0].headers
    elif harness.mode == "http-key":
        harness.provider.assert_not_called()
        assert harness.http_requests[0].headers["api-key"] == "test-api-key"
    else:
        assert harness.client is not None
        assert harness.client.timeout == 42.0
        harness.client.close.assert_not_called()
        harness.client.chat.completions.create.assert_awaited_once()
        forwarded = cast(
            list[typechat.PromptSection],
            harness.client.chat.completions.create.call_args.kwargs["messages"],
        )
        assert forwarded is not prompt
        content = forwarded[1]["content"]
        assert isinstance(content, list)
        part = content[1]
        assert part["type"] == "image_url"
        part["image_url"]["url"] = "changed by the configured client"
        assert prompt == original


@pytest.mark.parametrize("temperature", [0.0, 1.0, None])
def test_temperature_is_configurable_and_none_omits_the_field(
    model_factory: ModelFactory,
    temperature: float | None,
):
    harness = model_factory(["reply"], temperature=temperature)
    if harness.http_model is not None:
        harness.http_model.default_params["temperature"] = "must-not-override-the-option"
    assert asyncio.run(harness.model.complete(_image_context())) == typechat.Success("reply")
    if harness.client is not None:
        params = harness.client.chat.completions.create.call_args.kwargs
    else:
        params = json.loads(harness.http_requests[0].content)
    if temperature is None:
        assert "temperature" not in params
    else:
        assert params["temperature"] == temperature


def _assert_invalid_prompt(
    harness: _ModelHarness,
    result: typechat.Result[object],
    location: str,
) -> None:
    assert isinstance(result, typechat.Failure)
    assert location in result.message
    assert _PRIVATE_TEXT not in result.message
    assert _HOSTED_IMAGE not in result.message
    assert _DATA_IMAGE not in result.message
    assert not result.has_value
    assert result.response_text is None
    assert harness.prompts == []
    harness.provider.assert_not_called()
    if harness.client is not None:
        harness.client.chat.completions.create.assert_not_called()


_MALFORMED_PROMPTS: list[tuple[object, str]] = [
    (None, "Prompt"),
    (42, "Prompt"),
    (b"text", "Prompt"),
    ({"role": "user", "content": _PRIVATE_TEXT}, "Prompt"),
    (({"role": "user", "content": _PRIVATE_TEXT},), "Prompt"),
    ([None], "section 0"),
    ([_PRIVATE_TEXT], "section 0"),
    ([{}], "section 0"),
    ([{"content": _PRIVATE_TEXT}], "section 0"),
    ([{"role": _PRIVATE_TEXT, "content": _PRIVATE_TEXT}], "section 0"),
    ([{"role": None, "content": _PRIVATE_TEXT}], "section 0"),
    ([{"role": [], "content": _PRIVATE_TEXT}], "section 0"),
    ([{"role": "user"}], "section 0"),
    ([{"role": "user", "content": None}], "section 0"),
    ([{"role": "user", "content": 42}], "section 0"),
    ([{"role": "user", "content": {"type": "text", "text": _PRIVATE_TEXT}}], "section 0"),
    ([{"role": "user", "content": ({"type": "text", "text": _PRIVATE_TEXT},)}], "section 0"),
]


@pytest.mark.parametrize("prompt, location", _MALFORMED_PROMPTS)
def test_rejects_malformed_sections_before_authentication_or_dispatch(
    model_factory: ModelFactory,
    prompt: object,
    location: str,
):
    harness = model_factory([])
    result = asyncio.run(harness.model.complete(cast(str | list[typechat.PromptSection], prompt)))
    _assert_invalid_prompt(harness, result, location)


@pytest.mark.parametrize("part", [
    _PRIVATE_TEXT,
    None,
    42,
    [],
    {},
    {"text": _PRIVATE_TEXT},
    {"type": "audio", "audio": _PRIVATE_TEXT},
    {"type": 42, "text": _PRIVATE_TEXT},
    {"type": "text"},
    {"type": "text", "text": None},
    {"type": "text", "text": 42},
    {"type": "text", "text": []},
    {"type": "image_url"},
    {"type": "image_url", "image_url": _HOSTED_IMAGE},
    {"type": "image_url", "image_url": None},
    {"type": "image_url", "image_url": []},
    {"type": "image_url", "image_url": {}},
    {"type": "image_url", "image_url": {"url": ""}},
    {"type": "image_url", "image_url": {"url": None}},
    {"type": "image_url", "image_url": {"url": 42}},
    {"type": "image_url", "image_url": {"url": []}},
    {"type": "image_url", "image_url": {"url": _HOSTED_IMAGE, "detail": _PRIVATE_TEXT}},
    {"type": "image_url", "image_url": {"url": _DATA_IMAGE, "detail": None}},
    {"type": "image_url", "image_url": {"url": _HOSTED_IMAGE, "detail": []}},
    {"type": "image_url", "image_url": {"url": _HOSTED_IMAGE, "detail": 42}},
])
def test_rejects_malformed_parts_without_exposing_content(model_factory: ModelFactory, part: object):
    prompt = [
        {"role": "system", "content": "Instructions"},
        {"role": "user", "content": [{"type": "text", "text": _PRIVATE_TEXT}, part]},
    ]
    harness = model_factory([])
    result = asyncio.run(harness.model.complete(cast(list[typechat.PromptSection], prompt)))
    _assert_invalid_prompt(harness, result, "section 1, part 1")


@pytest.mark.parametrize("role", ["system", "assistant"])
def test_images_are_only_supported_in_user_messages(model_factory: ModelFactory, role: str):
    prompt = [{"role": role, "content": [{"type": "image_url", "image_url": {"url": _HOSTED_IMAGE}}]}]
    harness = model_factory([])
    result = asyncio.run(harness.model.complete(cast(list[typechat.PromptSection], prompt)))
    _assert_invalid_prompt(harness, result, "section 0, part 0")
    assert isinstance(result, typechat.Failure)
    assert "only supported in user messages" in result.message


@pytest.mark.parametrize("content", ["reply", "", None, 0, False, [], {}, [{"type": "text", "text": "reply"}]])
def test_completions_remain_text_only(model_factory: ModelFactory, content: object):
    harness = model_factory([content])
    result = asyncio.run(harness.model.complete(_image_context()))
    if isinstance(content, str):
        assert result == typechat.Success(content)
    elif content is None and harness.http_model is not None:
        assert result == typechat.Success("")
    else:
        assert isinstance(result, typechat.Failure)
        assert "content" in result.message
        assert not result.has_value
        assert result.response_text is None
    assert len(harness.prompts) == 1


@dataclass
class _ImageResult:
    value: int


@pytest.mark.parametrize("responses, repair_limit, expected", [
    (['{"value":1}'], 1, typechat.Success(_ImageResult(1))),
    (["not JSON", '{"value":2}'], 1, typechat.Success(_ImageResult(2))),
    (['{"value":}', '{"value":2}'], 1, typechat.Success(_ImageResult(2))),
    (['{"value":"wrong"}', '{"value":3}'], 1, typechat.Success(_ImageResult(3))),
    (
        ['{"value":"wrong"}', '{"value":"still wrong"}'],
        1,
        typechat.Failure("", value={"value": "still wrong"}, response_text='{"value":"still wrong"}'),
    ),
    (
        ['{"value":"wrong"}', "not JSON"],
        1,
        typechat.Failure("", value={"value": "wrong"}, response_text="not JSON"),
    ),
    (
        ['{"value":"wrong"}', typechat.Failure("model failure")],
        1,
        typechat.Failure("", value={"value": "wrong"}, response_text='{"value":"wrong"}'),
    ),
    (
        ['{"value":"wrong"}'],
        0,
        typechat.Failure("", value={"value": "wrong"}, response_text='{"value":"wrong"}'),
    ),
    (
        ['{"value":"wrong"}', '{"value":"still wrong"}', '{"value":4}'],
        2,
        typechat.Success(_ImageResult(4)),
    ),
    ([typechat.Failure("initial model failure")], 1, typechat.Failure("")),
])
def test_translator_retains_image_context_layout_repair_limits_and_failure_payloads(
    model_factory: ModelFactory,
    responses: list[object],
    repair_limit: int,
    expected: typechat.Result[_ImageResult],
):
    harness = model_factory(responses)
    class LimitedTranslator(typechat.TypeChatJsonTranslator[_ImageResult]):
        _max_repair_attempts = repair_limit

    translator = LimitedTranslator(
        harness.model, typechat.TypeChatValidator(_ImageResult), _ImageResult,
    )
    preamble = _image_context()
    original = deepcopy(preamble)
    result = asyncio.run(translator.translate("Describe the images.", prompt_preamble=preamble))

    if isinstance(expected, typechat.Success):
        assert result == expected
    else:
        assert isinstance(result, typechat.Failure)
        assert result.message
        assert result.has_value == expected.has_value
        assert result.value == expected.value
        assert result.response_text == expected.response_text
    assert preamble == original
    assert len(harness.prompts) == len(responses)
    expected_request: typechat.PromptSection = {"role": "user", "content": f"""
You are a service that translates user requests into JSON objects of type "{translator.type_name}" according to the following TypeScript definitions:
```
{translator.schema_str}
```
The following is a user request:
'''
Describe the images.
'''
The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
"""}
    first_prompt = [*original, expected_request]
    for attempt, prompt in enumerate(harness.prompts):
        assert prompt[:len(first_prompt)] == first_prompt
        assert len(prompt) == len(first_prompt) + 2 * attempt
        if attempt:
            assert prompt[:-2] == harness.prompts[attempt - 1]
            assert prompt[-2] == {"role": "assistant", "content": responses[attempt - 1]}
            assert prompt[-1]["role"] == "user"
            repair = prompt[-1]["content"]
            assert isinstance(repair, str)
            assert repair.startswith("\nThe above JSON object is invalid for the following reason:\n'''\n")
            assert repair.endswith("\nThe following is a revised JSON object:\n")


def test_malformed_preamble_does_not_trigger_translator_repair(
    model_factory: ModelFactory,
    monkeypatch: pytest.MonkeyPatch,
):
    harness = model_factory([])
    complete = AsyncMock(wraps=harness.model.complete)
    monkeypatch.setattr(harness.model, "complete", complete)
    translator = typechat.TypeChatJsonTranslator(
        harness.model, typechat.TypeChatValidator(_ImageResult), _ImageResult,
    )
    preamble = cast(list[typechat.PromptSection], [{"role": "user", "content": [_PRIVATE_TEXT]}])
    result = asyncio.run(translator.translate("Describe the images.", prompt_preamble=preamble))
    _assert_invalid_prompt(harness, result, "section 0, part 0")
    complete.assert_awaited_once()


def test_documented_model_and_translator_examples_work_offline(model_factory: ModelFactory):
    harness = model_factory(["image description", '{"description":"two images"}'])
    text, data = asyncio.run(inspect_images(harness.model, "aW1hZ2U="))
    assert text == typechat.Success("image description")
    assert data == typechat.Success({"description": "two images"})
    assert len(harness.prompts) == 2
    assert harness.prompts[1][:-1] == harness.prompts[0]


@pytest.mark.parametrize("model_factory", ["http-key", "http-token"], indirect=True)
def test_image_prompts_preserve_http_retries_and_per_attempt_authentication(model_factory: ModelFactory):
    harness = model_factory([httpx.Response(429), httpx.Response(500), "reply"])
    assert harness.http_model is not None
    harness.http_model.max_retry_attempts = 2
    harness.provider.side_effect = ["first-token", "second-token", "third-token"]
    prompt = _image_context()
    original = deepcopy(prompt)

    assert asyncio.run(harness.model.complete(prompt)) == typechat.Success("reply")
    assert harness.prompts == [original, original, original]
    assert prompt == original
    if harness.mode == "http-token":
        assert harness.provider.call_count == 3
        assert [request.headers["Authorization"] for request in harness.http_requests] == [
            "Bearer first-token", "Bearer second-token", "Bearer third-token",
        ]
    else:
        harness.provider.assert_not_called()
        assert all(request.headers["api-key"] == "test-api-key" for request in harness.http_requests)


@pytest.mark.parametrize("model_factory", ["http-key", "http-token"], indirect=True)
def test_image_prompts_preserve_http_timeout_and_response_size_controls(model_factory: ModelFactory):
    harness = model_factory(["x" * 1000])
    assert harness.http_model is not None
    harness.http_model.timeout_seconds = 7
    harness.http_model.max_response_bytes = 100
    result = asyncio.run(harness.model.complete(_image_context()))
    assert isinstance(result, typechat.Failure)
    assert "maximum allowed size" in result.message
    assert len(harness.http_requests) == 1
    assert harness.http_requests[0].extensions["timeout"] == {
        "connect": 7, "read": 7, "write": 7, "pool": 7,
    }


@pytest.mark.parametrize("model_factory", ["client"], indirect=True)
@pytest.mark.parametrize("exception", [RuntimeError("Client failure."), asyncio.CancelledError()])
def test_image_prompts_preserve_client_exceptions_and_ownership(
    model_factory: ModelFactory,
    exception: BaseException,
):
    harness = model_factory([exception])
    with pytest.raises(type(exception)) as raised:
        asyncio.run(harness.model.complete(_image_context()))
    assert raised.value is exception
    assert len(harness.prompts) == 1
    assert harness.client is not None
    assert harness.client.timeout == 42.0
    harness.client.close.assert_not_called()
    harness.client.chat.completions.create.assert_awaited_once()


@pytest.mark.parametrize("model_factory", ["http-token"], indirect=True)
def test_image_prompts_preserve_token_provider_cancellation(model_factory: ModelFactory):
    harness = model_factory([])
    harness.provider.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(harness.model.complete(_image_context()))
    harness.provider.assert_called_once_with()
    assert harness.http_requests == []
