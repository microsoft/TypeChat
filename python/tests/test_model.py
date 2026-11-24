"""
Tests for HttpxLanguageModel response-size limiting (DoS hardening).

These use httpx.MockTransport to drive HttpxLanguageModel.complete without a real endpoint.
"""

import asyncio
from collections.abc import Callable

import httpx
import typechat
from typechat._internal.model import HttpxLanguageModel


class _MockHttpxLanguageModel(HttpxLanguageModel):
    def use_mock_transport(self, handler: Callable[[httpx.Request], httpx.Response]) -> None:
        self._async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _make_model(handler: Callable[[httpx.Request], httpx.Response]) -> HttpxLanguageModel:
    model = _MockHttpxLanguageModel(
        url="https://example.invalid/v1/chat/completions",
        headers={},
        default_params={"model": "gpt-test"},
    )
    # Route the model's requests through a mock transport instead of the network.
    model.use_mock_transport(handler)
    return model


def _completion_payload(content: str) -> dict[str, list[dict[str, dict[str, str]]]]:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


def test_reads_response_within_size_limit():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_completion_payload("Hello!"))

    model = _make_model(handler)
    result = asyncio.run(model.complete("hi"))
    assert isinstance(result, typechat.Success)
    assert result.value == "Hello!"


def test_rejects_oversized_response_via_content_length():
    def handler(request: httpx.Request) -> httpx.Response:
        # httpx sets Content-Length for an eager JSON body, exercising the fast-fail path.
        return httpx.Response(200, json=_completion_payload("x" * 5000))

    model = _make_model(handler)
    model.max_response_bytes = 100
    result = asyncio.run(model.complete("hi"))
    assert isinstance(result, typechat.Failure)
    assert "maximum allowed size" in result.message


def test_rejects_oversized_streamed_response_without_content_length():
    async def body():
        # A chunked body (no Content-Length) forces the incremental accumulation check.
        for _ in range(16):
            yield b"x" * 256

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body())

    model = _make_model(handler)
    model.max_response_bytes = 512
    result = asyncio.run(model.complete("hi"))
    assert isinstance(result, typechat.Failure)
    assert "maximum allowed size" in result.message


def test_size_limit_disabled_allows_large_response():
    big_content = "x" * 5000

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_completion_payload(big_content))

    model = _make_model(handler)
    model.max_response_bytes = 0
    result = asyncio.run(model.complete("hi"))
    assert isinstance(result, typechat.Success)
    assert result.value == big_content
