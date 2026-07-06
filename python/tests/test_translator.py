
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

