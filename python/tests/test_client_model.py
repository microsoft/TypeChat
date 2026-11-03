import asyncio
import subprocess
import sys
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing_extensions import Literal, TypedDict

import pytest
import typechat


@dataclass
class _Message:
    content: str | None


@dataclass
class _Choice:
    message: _Message


@dataclass
class _Completion:
    choices: list[_Choice]


class _Request(TypedDict):
    model: str
    messages: list[typechat.PromptSection]
    temperature: float
    n: int
    stream: Literal[False]


class _Completions:
    requests: list[_Request]
    _responses: Iterator[_Completion | BaseException]

    def __init__(self, responses: Sequence[_Completion | BaseException]):
        super().__init__()
        self.requests = []
        self._responses = iter(responses)

    async def create(
        self,
        *,
        model: str,
        messages: list[typechat.PromptSection],
        temperature: float,
        n: int,
        stream: Literal[False],
    ) -> _Completion:
        self.requests.append({
            "model": model,
            "messages": messages.copy(),
            "temperature": temperature,
            "n": n,
            "stream": stream,
        })
        response = next(self._responses)
        if isinstance(response, BaseException):
            raise response
        return response


@dataclass
class _Chat:
    completions: _Completions


@dataclass
class _Client:
    chat: _Chat
    timeout: float = 42.0
    closed: bool = False

    async def close(self) -> None:
        self.closed = True


def _completion(content: str | None) -> _Completion:
    return _Completion([_Choice(_Message(content))])


def test_reuses_the_configured_client_and_normalizes_string_prompts():
    client = _Client(_Chat(_Completions([_completion("first"), _completion("second")])))
    model = typechat.create_openai_language_model_from_client(client, model="azure-deployment")

    async def run() -> None:
        assert await model.complete("first prompt") == typechat.Success("first")
        assert await model.complete("second prompt") == typechat.Success("second")

    asyncio.run(run())
    assert client.timeout == 42.0
    assert not client.closed
    assert client.chat.completions.requests == [
        {
            "model": "azure-deployment",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "n": 1,
            "stream": False,
        }
        for prompt in ["first prompt", "second prompt"]
    ]


def test_forwards_prompt_sections_without_mutating_them():
    client = _Client(_Chat(_Completions([_completion("reply")])))
    model = typechat.create_openai_language_model_from_client(client, "gpt-test")
    prompt: list[typechat.PromptSection] = [
        {"role": "system", "content": "Instructions"},
        {"role": "user", "content": "Question"},
        {"role": "assistant", "content": "Previous reply"},
    ]
    original = prompt.copy()

    assert asyncio.run(model.complete(prompt)) == typechat.Success("reply")
    assert client.chat.completions.requests[0]["messages"] == original
    assert prompt == original


@pytest.mark.parametrize("completion", [_Completion([]), _completion(None)])
def test_missing_text_is_an_explicit_failure(completion: _Completion):
    client = _Client(_Chat(_Completions([completion])))
    model = typechat.create_openai_language_model_from_client(client, "gpt-test")
    result = asyncio.run(model.complete("hi"))
    assert isinstance(result, typechat.Failure)
    assert "Client completion returned no" in result.message


def test_empty_text_remains_a_successful_completion():
    client = _Client(_Chat(_Completions([_completion("")])))
    model = typechat.create_openai_language_model_from_client(client, "gpt-test")
    assert asyncio.run(model.complete("hi")) == typechat.Success("")


@pytest.mark.parametrize("exception", [RuntimeError("Client request failed."), asyncio.CancelledError()])
def test_client_errors_propagate_without_extra_retries(exception: BaseException):
    client = _Client(_Chat(_Completions([exception])))
    model = typechat.create_openai_language_model_from_client(client, "gpt-test")

    with pytest.raises(type(exception)) as raised:
        asyncio.run(model.complete("hi"))

    assert raised.value is exception
    assert len(client.chat.completions.requests) == 1
    assert not client.closed


@pytest.mark.parametrize("model_name", ["", " "])
def test_requires_a_model_or_deployment_name(model_name: str):
    client = _Client(_Chat(_Completions([])))
    with pytest.raises(ValueError, match="must not be empty"):
        typechat.create_openai_language_model_from_client(client, model_name)


@dataclass
class _Response:
    value: str


def test_client_adapter_preserves_translation_validation_and_repair():
    client = _Client(_Chat(_Completions([
        _completion('{"wrong": "field"}'),
        _completion('{"value": "repaired"}'),
    ])))
    model = typechat.create_openai_language_model_from_client(client, "gpt-test")
    translator = typechat.TypeChatJsonTranslator(model, typechat.TypeChatValidator(_Response), _Response)

    assert asyncio.run(translator.translate("Get a value")) == typechat.Success(_Response("repaired"))
    requests = client.chat.completions.requests
    assert len(requests) == 2
    assert [message["role"] for message in requests[1]["messages"]] == ["user", "assistant", "user"]


def test_typechat_import_does_not_require_provider_sdks():
    subprocess.run([
        sys.executable,
        "-c",
        "import sys; sys.modules['openai'] = None; sys.modules['azure'] = None; " +
        "import typechat; assert callable(typechat.create_openai_language_model_from_client)",
    ], check=True)
