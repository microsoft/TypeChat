import asyncio
import json
from collections.abc import Awaitable, Callable
from unittest.mock import Mock

import httpx
import pytest
import typechat


Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def mock_client(monkeypatch: pytest.MonkeyPatch) -> Callable[[Handler], httpx.AsyncClient]:
    async_client = httpx.AsyncClient

    def create(handler: Handler) -> httpx.AsyncClient:
        client = async_client(transport=httpx.MockTransport(handler))
        monkeypatch.setattr(httpx, "AsyncClient", lambda: client)
        return client

    return create


def _completion(content: str = "Hello!") -> dict[str, list[dict[str, dict[str, str]]]]:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


def test_sync_token_provider_is_called_for_each_completion(mock_client: Callable[[Handler], httpx.AsyncClient]):
    requests: list[httpx.Request] = []
    tokens = iter(["first-token", "second-token"])

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_completion())

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        api_key=None,
        endpoint="https://example.invalid/chat/completions?api-version=test",
        token_provider=lambda: next(tokens),
    )

    async def run() -> None:
        async with model:
            assert await model.complete("first prompt") == typechat.Success("Hello!")
            assert await model.complete("second prompt") == typechat.Success("Hello!")

    asyncio.run(run())
    assert [request.headers["Authorization"] for request in requests] == [
        "Bearer first-token",
        "Bearer second-token",
    ]
    assert all("api-key" not in request.headers for request in requests)
    assert model.headers == {}
    assert json.loads(requests[0].content) == {
        "messages": [{"role": "user", "content": "first prompt"}],
        "temperature": 0.0,
        "n": 1,
    }


def test_async_token_provider_is_awaited_on_each_retry(mock_client: Callable[[Handler], httpx.AsyncClient]):
    requests: list[httpx.Request] = []
    statuses = iter([429, 500, 200])
    token_count = 0

    async def provider() -> str:
        nonlocal token_count
        await asyncio.sleep(0)
        token_count += 1
        return f"token-{token_count}"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(next(statuses), json=_completion())

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/chat/completions", token_provider=provider,
    )
    model.retry_pause_seconds = 0
    model.max_retry_attempts = 2

    async def run() -> None:
        async with model:
            assert await model.complete("hi") == typechat.Success("Hello!")

    asyncio.run(run())
    assert token_count == 3
    assert [request.headers["Authorization"] for request in requests] == [
        "Bearer token-1",
        "Bearer token-2",
        "Bearer token-3",
    ]
    assert all("api-key" not in request.headers for request in requests)


def test_provider_can_return_a_future(mock_client: Callable[[Handler], httpx.AsyncClient]):
    requests: list[httpx.Request] = []

    def provider() -> Awaitable[str]:
        future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        future.set_result("future-token")
        return future

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_completion())

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/chat/completions", token_provider=provider,
    )

    async def run() -> None:
        async with model:
            assert await model.complete("hi") == typechat.Success("Hello!")

    asyncio.run(run())
    assert requests[0].headers["Authorization"] == "Bearer future-token"


@pytest.mark.parametrize("token", ["", " ", None, b"not-a-string"])
def test_invalid_tokens_fail_without_a_request(
    mock_client: Callable[[Handler], httpx.AsyncClient],
    token: object,
):
    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("An invalid token must not reach the endpoint.")

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None,
        "https://example.invalid/chat/completions",
        token_provider=Mock(return_value=token),
    )

    async def run() -> None:
        async with model:
            assert await model.complete("hi") == typechat.Failure("Token provider must return a nonempty string.")

    asyncio.run(run())


def test_provider_failure_uses_existing_failure_handling(mock_client: Callable[[Handler], httpx.AsyncClient]):
    def provider() -> str:
        raise ValueError("Token acquisition failed.")

    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("Token acquisition failed before the request.")

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/chat/completions", token_provider=provider,
    )
    model.max_retry_attempts = 0

    async def run() -> None:
        async with model:
            assert await model.complete("hi") == typechat.Failure("Token acquisition failed.")

    asyncio.run(run())


def test_provider_cancellation_propagates(mock_client: Callable[[Handler], httpx.AsyncClient]):
    async def provider() -> str:
        raise asyncio.CancelledError()

    def handler(request: httpx.Request) -> httpx.Response:
        pytest.fail("A cancelled token acquisition must not reach the endpoint.")

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/chat/completions", token_provider=provider,
    )

    async def run() -> None:
        async with model:
            with pytest.raises(asyncio.CancelledError):
                await model.complete("hi")

    asyncio.run(run())


def test_provider_path_preserves_http_limits(mock_client: Callable[[Handler], httpx.AsyncClient]):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=_completion("x" * 5000))

    mock_client(handler)
    model = typechat.create_azure_openai_language_model(
        None, "https://example.invalid/chat/completions", token_provider=lambda: "token",
    )
    model.timeout_seconds = 7
    model.max_response_bytes = 100

    async def run() -> None:
        async with model:
            result = await model.complete("hi")
            assert isinstance(result, typechat.Failure)
            assert "maximum allowed size" in result.message

    asyncio.run(run())
    assert len(requests) == 1
    assert requests[0].extensions["timeout"] == {
        "connect": 7,
        "read": 7,
        "write": 7,
        "pool": 7,
    }
