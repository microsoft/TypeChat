# Copyright (c) Microsoft. All rights reserved.

from typing_extensions import Any

import typechat
from typechat._internal.model import (
    HttpxLanguageModel,
    _completion_info_responses,  # pyright: ignore[reportPrivateUsage]
    _responses_text,  # pyright: ignore[reportPrivateUsage]
)


def test_openai_model_detects_responses_endpoint() -> None:
    model = typechat.create_openai_language_model("sk-test", "gpt-4", "https://api.openai.com/v1/responses")
    assert isinstance(model, HttpxLanguageModel)
    assert model.use_responses_api is True
    assert model.url == "https://api.openai.com/v1/responses"


def test_openai_model_builds_responses_endpoint_when_forced() -> None:
    model = typechat.create_openai_language_model("sk-test", "gpt-4", use_responses_api=True)
    assert model.use_responses_api is True
    assert model.url == "https://api.openai.com/v1/responses"


def test_openai_model_defaults_to_chat_completions() -> None:
    model = typechat.create_openai_language_model("sk-test", "gpt-4")
    assert model.use_responses_api is False
    assert model.url == "https://api.openai.com/v1/chat/completions"


def test_responses_text_and_completion_info() -> None:
    body: Any = {
        "id": "resp-123",
        "object": "response",
        "status": "completed",
        "model": "gpt-4.1-2025-04-14",
        "output": [
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Hi there!"}]},
        ],
        "usage": {
            "input_tokens": 20,
            "output_tokens": 5,
            "total_tokens": 25,
            "input_tokens_details": {"cached_tokens": 8},
            "output_tokens_details": {"reasoning_tokens": 3},
        },
    }
    assert _responses_text(body) == "Hi there!"

    info = _completion_info_responses(body)
    assert info.model == "gpt-4.1-2025-04-14"
    assert info.finish_reason == "stop"
    assert info.usage == typechat.TokenUsage(
        prompt_tokens=20,
        completion_tokens=5,
        total_tokens=25,
        cached_prompt_tokens=8,
        reasoning_tokens=3,
    )
    assert info.raw is body


def test_responses_incomplete_maps_to_length() -> None:
    body: Any = {
        "status": "incomplete",
        "incomplete_details": {"reason": "max_output_tokens"},
        "output": [
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "truncated"}]},
        ],
    }
    info = _completion_info_responses(body)
    assert info.finish_reason == "length"
