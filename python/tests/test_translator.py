
import asyncio
from dataclasses import dataclass
from typing_extensions import Any, Iterator, Literal, TypedDict, override
import typechat

class ConvoRecord(TypedDict):
    kind: Literal["CLIENT REQUEST", "MODEL RESPONSE"]
    payload: str | list[typechat.PromptSection]

class FixedModel(typechat.TypeChatLanguageModel):
    responses: Iterator[str]
    conversation: list[ConvoRecord]

    "A model which responds with one of a series of responses."
    def __init__(self, responses: list[str]) -> None:
        super().__init__()
        self.responses = iter(responses)
        self.conversation = []

    @override
    async def complete(self, prompt: str | list[typechat.PromptSection]) -> typechat.Result[str]:
        # Capture a snapshot because the translator
        # can choose to pass in the same underlying list.
        if isinstance(prompt, list):
            prompt = prompt.copy()

        self.conversation.append({ "kind": "CLIENT REQUEST", "payload": prompt })
        response = next(self.responses)
        self.conversation.append({ "kind": "MODEL RESPONSE", "payload": response })
        return typechat.Success(response)

@dataclass
class ExampleABC:
    a: str
    b: bool
    c: int

v = typechat.TypeChatValidator(ExampleABC)

def test_translator_with_immediate_pass(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

def test_translator_with_single_failure(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

def test_translator_with_invalid_json(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello" "b": true }',
        '{ "a": "hello" "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

def test_translator_with_single_failure_and_str_preamble(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    asyncio.run(t.translate(
        "Get me stuff.",
        prompt_preamble="Just so you know, I need some stuff.",
    ))
    
    assert m.conversation == snapshot

def test_translator_with_single_failure_and_list_preamble_1(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    asyncio.run(t.translate("Get me stuff.", prompt_preamble=[
        {"role": "user", "content": "Hey, I need some stuff."},
        {"role": "assistant", "content": "Okay, what kind of stuff?"},
    ]))
    
    assert m.conversation == snapshot


def test_translator_passes_through_completion_info():
    class InfoModel(typechat.TypeChatLanguageModel):
        "A model that reports completion metadata alongside its response."
        @override
        async def complete(self, prompt: str | list[typechat.PromptSection]) -> typechat.Result[str]:
            return typechat.Success(
                '{ "a": "hello", "b": true, "c": 1234 }',
                typechat.CompletionInfo(
                    model="gpt-4-0613",
                    usage=typechat.TokenUsage(
                        prompt_tokens=11,
                        completion_tokens=7,
                        total_tokens=18,
                        cached_prompt_tokens=4,
                        reasoning_tokens=3,
                    ),
                    finish_reason="stop",
                    raw={"id": "chatcmpl-123"},
                ),
            )

    t = typechat.TypeChatJsonTranslator(InfoModel(), v, ExampleABC)
    result = asyncio.run(t.translate("Get me stuff."))

    assert isinstance(result, typechat.Success)
    assert result.value == ExampleABC(a="hello", b=True, c=1234)
    assert result.info is not None
    assert result.info.model == "gpt-4-0613"
    assert result.info.finish_reason == "stop"
    assert result.info.usage == typechat.TokenUsage(
        prompt_tokens=11,
        completion_tokens=7,
        total_tokens=18,
        cached_prompt_tokens=4,
        reasoning_tokens=3,
    )
    assert result.info.raw == {"id": "chatcmpl-123"}
    assert result.info.repair_attempts == 0


def test_translator_reports_repair_attempts():
    # First response fails validation (missing "c"); the second passes.
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    result = asyncio.run(t.translate("Get me stuff."))

    assert isinstance(result, typechat.Success)
    assert result.info is not None
    assert result.info.repair_attempts == 1


def test_translator_reports_zero_repairs_on_immediate_pass():
    m = FixedModel([
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC)
    result = asyncio.run(t.translate("Get me stuff."))

    assert isinstance(result, typechat.Success)
    assert result.info is not None
    assert result.info.repair_attempts == 0

