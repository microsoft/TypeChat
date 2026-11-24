
import asyncio
from dataclasses import dataclass
from typing import NewType
from typing_extensions import Any, Iterator, Literal, TypedDict, override
import pytest
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

    def request(self, index: int = 0) -> list[typechat.PromptSection]:
        entry = self.conversation[index * 2]
        assert entry["kind"] == "CLIENT REQUEST"
        prompt = entry["payload"]
        assert isinstance(prompt, list)
        return prompt

@dataclass
class ExampleABC:
    a: str
    b: bool
    c: int

v = typechat.TypeChatValidator(ExampleABC)

# Keep the original conversation snapshots as byte-for-byte legacy prompt checks.
def test_translator_with_immediate_pass(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC, use_legacy_prompt=True)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

@dataclass
class TupleUnionResponse:
    values: tuple[int | str, ...]
    optional_values: tuple[str | None, ...]
    choices: tuple[Literal["yes", "no"], ...]


def test_translator_with_variadic_tuple_unions():
    model = FixedModel([
        '{"values": [1, "two"], "optional_values": ["three", null], "choices": ["yes", "no"]}',
    ])
    validator = typechat.TypeChatValidator(TupleUnionResponse)
    translator = typechat.TypeChatJsonTranslator(model, validator, TupleUnionResponse)

    result = asyncio.run(translator.translate("Get tuple values."))

    assert result == typechat.Success(TupleUnionResponse((1, "two"), ("three", None), ("yes", "no")))
    assert len(model.conversation) == 2


def test_translator_with_single_failure(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC, use_legacy_prompt=True)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

def test_translator_with_invalid_json(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello" "b": true }',
        '{ "a": "hello" "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC, use_legacy_prompt=True)
    asyncio.run(t.translate("Get me stuff."))
    
    assert m.conversation == snapshot

def test_translator_with_single_failure_and_str_preamble(snapshot: Any):
    m = FixedModel([
        '{ "a": "hello", "b": true }',
        '{ "a": "hello", "b": true, "c": 1234 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC, use_legacy_prompt=True)
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
    t = typechat.TypeChatJsonTranslator(m, v, ExampleABC, use_legacy_prompt=True)
    asyncio.run(t.translate("Get me stuff.", prompt_preamble=[
        {"role": "user", "content": "Hey, I need some stuff."},
        {"role": "assistant", "content": "Okay, what kind of stuff?"},
    ]))
    
    assert m.conversation == snapshot

UserId = NewType("UserId", str)

@dataclass
class ExampleWithNewType:
    user_id: UserId
    count: int

v_newtype = typechat.TypeChatValidator(ExampleWithNewType)

def test_translator_with_newtype(snapshot: Any):
    m = FixedModel([
        '{ "user_id": "abc", "count": 1 }',
    ])
    t = typechat.TypeChatJsonTranslator(m, v_newtype, ExampleWithNewType, use_legacy_prompt=True)
    asyncio.run(t.translate("Get me a user."))
    
    assert m.conversation == snapshot


_VALID = '{"a":"ok","b":true,"c":1}'
_CURRENT = "  A new request:\n'''keep these delimiters''' ☕\n"


def test_schema_first_sends_system_and_one_verbatim_user_request():
    model = FixedModel([_VALID])
    translator = typechat.TypeChatJsonTranslator(model, v, ExampleABC)
    assert asyncio.run(translator.translate(_CURRENT)) == typechat.Success(ExampleABC("ok", True, 1))

    system, user = model.request()
    assert system["role"] == "system"
    instructions = system["content"]
    assert isinstance(instructions, str)
    assert translator.schema_str in instructions
    assert 'JSON objects of type "ExampleABC"' in instructions
    assert "2 spaces of indentation and no properties with the value undefined" in instructions
    assert _CURRENT not in instructions
    assert user == {"role": "user", "content": _CURRENT}


def test_schema_first_keeps_history_roles_and_order_outside_system():
    model = FixedModel([_VALID, _VALID])
    translator = typechat.TypeChatJsonTranslator(model, v, ExampleABC)
    prior = "A prior request."
    asyncio.run(translator.translate(prior))
    history: list[typechat.PromptSection] = [
        {"role": "user", "content": prior}, {"role": "assistant", "content": _VALID},
    ]
    original = history.copy()
    asyncio.run(translator.translate(_CURRENT, prompt_preamble=history))

    system = model.request()[0]
    assert model.request(1) == [system, *original, {"role": "user", "content": _CURRENT}]
    assert system["role"] == "system"
    assert all(text not in system["content"] for text in (prior, _VALID, _CURRENT))
    assert history == original


def test_schema_first_string_preamble_stays_a_user_message():
    model = FixedModel([_VALID])
    translator = typechat.TypeChatJsonTranslator(model, v, ExampleABC)
    asyncio.run(translator.translate(_CURRENT, prompt_preamble="Untrusted context."))
    system, context, request = model.request()
    assert system["role"] == "system" and "Untrusted context." not in system["content"]
    assert context == {"role": "user", "content": "Untrusted context."}
    assert request == {"role": "user", "content": _CURRENT}


def test_schema_invalid_repair_appends_raw_assistant_and_user_diagnostic():
    raw = 'Model commentary\n```json\n{ "a": "ok", "b": true, "c": "not an int" }\n```\n'
    model = FixedModel([raw, _VALID])
    translator = typechat.TypeChatJsonTranslator(model, v, ExampleABC)
    result = asyncio.run(translator.translate(_CURRENT))
    assert result == typechat.Success(ExampleABC("ok", True, 1))
    initial = model.request()
    repair = model.request(1)
    assert repair[:-2] == initial
    assert repair[-2] == {"role": "assistant", "content": raw}
    assert repair[-1]["role"] == "user"
    diagnostic = repair[-1]["content"]
    assert isinstance(diagnostic, str)
    assert 'Validation path `c` failed for value `"not an int"`' in diagnostic
    assert initial[0]["role"] == "system"
    assert raw not in initial[0]["content"] and "not an int" not in initial[0]["content"]


class _LegacyOnlyTranslator(typechat.TypeChatJsonTranslator[ExampleABC]):
    @override
    def _create_request_prompt(self, intent: str) -> str:
        return f"custom request: {intent}"


def test_explicit_legacy_uses_custom_request_prompt_after_preamble():
    model = FixedModel([_VALID])
    translator = _LegacyOnlyTranslator(model, v, ExampleABC, use_legacy_prompt=True)
    asyncio.run(translator.translate(_CURRENT, prompt_preamble="context"))
    assert model.request() == [
        {"role": "user", "content": "context"}, {"role": "user", "content": f"custom request: {_CURRENT}"},
    ]


@pytest.mark.parametrize("instance_override", [False, True], ids=["subclass", "instance"])
def test_legacy_only_override_requires_migration_before_model_call(instance_override: bool, monkeypatch: pytest.MonkeyPatch):
    model = FixedModel([])
    if instance_override:
        translator = typechat.TypeChatJsonTranslator(model, v, ExampleABC)
        def legacy_prompt(intent: str) -> str:
            return f"custom request: {intent}"
        monkeypatch.setattr(translator, "_create_request_prompt", legacy_prompt)
    else:
        translator = _LegacyOnlyTranslator(model, v, ExampleABC)
    with pytest.raises(ValueError, match=r"_create_request_prompt.*use_legacy_prompt=True.*_create_system_prompt"):
        asyncio.run(translator.translate(_CURRENT))
    assert model.conversation == []


def test_custom_system_prompt_is_used_without_invoking_legacy_hook():
    class DualTranslator(_LegacyOnlyTranslator):
        @override
        def _create_request_prompt(self, intent: str) -> str:
            raise AssertionError("The legacy request hook must not be called for the default layout.")

        @override
        def _create_system_prompt(self) -> str:
            return super()._create_system_prompt() + "Application instructions."

    model = FixedModel([_VALID])
    translator = DualTranslator(model, v, ExampleABC)
    asyncio.run(translator.translate(_CURRENT))
    system, user = model.request()
    assert system["role"] == "system"
    assert isinstance(system["content"], str) and system["content"].endswith("Application instructions.")
    assert "custom request:" not in system["content"] and _CURRENT not in system["content"]
    assert user == {"role": "user", "content": _CURRENT}


def test_more_specific_legacy_only_override_requires_migration():
    class Migrated(_LegacyOnlyTranslator):
        @override
        def _create_system_prompt(self) -> str:
            return "Application instructions."

    class Downstream(Migrated):
        @override
        def _create_request_prompt(self, intent: str) -> str:
            return f"Downstream instructions: {intent}"

    model = FixedModel([])
    with pytest.raises(ValueError, match="use_legacy_prompt=True"):
        asyncio.run(Downstream(model, v, ExampleABC).translate(_CURRENT))
    assert model.conversation == []
