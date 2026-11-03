import asyncio
from copy import deepcopy
from dataclasses import dataclass

import pytest
from typing_extensions import assert_type, override

from typechat import (
    Failure,
    PromptSection,
    Result,
    Success,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
    TypeChatValidator,
)


@dataclass
class Example:
    value: int


class FixedResultModel(TypeChatLanguageModel):
    def __init__(self, responses: list[Result[str]]) -> None:
        super().__init__()
        self._responses = iter(responses)
        self.prompts: list[str | list[PromptSection]] = []

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Result[str]:
        self.prompts.append(prompt.copy() if isinstance(prompt, list) else prompt)
        return next(self._responses)


class NoRepairTranslator(TypeChatJsonTranslator[Example]):
    _max_repair_attempts = 0


class RejectingValidator(TypeChatValidator[Example]):
    def __init__(self, failure: Failure) -> None:
        super().__init__(Example)
        self.failure = failure

    @override
    def validate_object(self, obj: object) -> Result[Example]:
        return self.failure


class CustomFailure(Failure):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


def translator_for(
    responses: list[Result[str]],
    validator: TypeChatValidator[Example] | None = None,
    *,
    repair: bool = True,
) -> tuple[TypeChatJsonTranslator[Example], FixedResultModel]:
    model = FixedResultModel(responses)
    validator = validator if validator is not None else TypeChatValidator(Example)
    if repair:
        translator = TypeChatJsonTranslator(model, validator, Example)
    else:
        translator = NoRepairTranslator(model, validator, Example)
    return translator, model


def test_message_only_failure_has_no_value():
    result = Failure("failed")
    assert not result.has_value
    assert result.response_text is None
    assert repr(result) == "Failure(message='failed')"
    assert not deepcopy(result).has_value


@pytest.mark.parametrize("value", [None, False, 0, "", {}, []])
def test_failure_retains_explicit_values(value: object):
    result = Failure("failed", value=value, response_text="")
    assert_type(result.value, object)
    assert result.has_value
    assert result.value is value
    assert result.response_text == ""
    assert "response_text" not in repr(result)


@pytest.mark.parametrize("value", [{"value": "invalid"}, None, False, 0, ""])
def test_validator_retains_the_entire_rejected_value(value: object):
    result = TypeChatValidator(Example).validate_object(value)
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value is value
    assert result.response_text is None


def test_translator_preserves_success():
    translator, model = translator_for([Success('{"value":42}')])
    result = asyncio.run(translator.translate("request"))
    assert result == Success(Example(42))
    assert len(model.prompts) == 1


def test_translator_retains_rejected_data_without_repair():
    response_text = 'before {"value":"invalid"} after'
    translator, model = translator_for([Success(response_text)], repair=False)
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value == {"value": "invalid"}
    assert result.response_text == response_text
    assert "failed for value" in result.message
    assert len(model.prompts) == 1


@pytest.mark.parametrize("value", [None, False, 0, ""])
def test_translator_preserves_custom_failure_payloads(value: object):
    original = Failure("custom", value=value, response_text="")
    translator, _ = translator_for([Success('{"value":1}')], RejectingValidator(original), repair=False)
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value is value
    assert result.response_text == ""
    assert result.message == "custom"
    assert original == Failure("custom", value=value, response_text="")


def test_translator_does_not_mutate_custom_message_only_failures():
    original = Failure("custom")
    translator, _ = translator_for([Success('{"value":1}')], RejectingValidator(original), repair=False)
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value == {"value": 1}
    assert result.response_text == '{"value":1}'
    assert not original.has_value
    assert original.response_text is None


def test_translator_preserves_failure_subclasses_and_metadata():
    original = CustomFailure("custom", "CUSTOM")
    translator, _ = translator_for([Success('{"value":1}')], RejectingValidator(original), repair=False)
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, CustomFailure)
    assert result.code == "CUSTOM"
    assert result.has_value
    assert result.value == {"value": 1}
    assert not original.has_value


@pytest.mark.parametrize("response_text", ["not JSON", 'before {"value":} after', ""])
def test_translator_retains_unparseable_text_without_inventing_data(response_text: str):
    translator, model = translator_for([Success(response_text)], repair=False)
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert not result.has_value
    assert result.response_text == response_text
    assert len(model.prompts) == 1


def test_translator_propagates_initial_model_failures_unchanged():
    original = Failure("network failure")
    translator, _ = translator_for([original])
    assert asyncio.run(translator.translate("request")) is original


def test_translator_preserves_successful_repair():
    first = '{"value":"invalid"}'
    translator, model = translator_for([Success(first), Success('{"value":42}')])
    assert asyncio.run(translator.translate("request")) == Success(Example(42))
    assert len(model.prompts) == 2
    repair_prompt = model.prompts[1]
    assert isinstance(repair_prompt, list)
    assert repair_prompt[1]["content"] == first
    assert "failed for value" in repair_prompt[2]["content"]


def test_translator_returns_latest_rejected_candidate_after_one_repair():
    response_text = '{"value":"second"}'
    translator, model = translator_for([Success('{"value":"first"}'), Success(response_text)])
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value == {"value": "second"}
    assert result.response_text == response_text
    assert len(model.prompts) == 2


def test_translator_retains_previous_candidate_when_repair_request_fails():
    response_text = '{"value":"invalid"}'
    original = Failure("network failure")
    translator, _ = translator_for([Success(response_text), original])
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.message == "network failure"
    assert result.has_value
    assert result.value == {"value": "invalid"}
    assert result.response_text == response_text
    assert not original.has_value
    assert original.response_text is None


def test_translator_preserves_context_supplied_by_the_model():
    original = Failure("model failure", value=None, response_text="")
    translator, _ = translator_for([Success('{"value":"invalid"}'), original])
    assert asyncio.run(translator.translate("request")) == original


def test_translator_preserves_model_failure_subclasses():
    original = CustomFailure("network failure", "NETWORK")
    translator, _ = translator_for([Success('{"value":"invalid"}'), original])
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, CustomFailure)
    assert result.code == "NETWORK"
    assert result.value == {"value": "invalid"}
    assert not original.has_value


def test_translator_does_not_leak_failure_context_into_another_translation():
    original = Failure("new request failed")
    translator, _ = translator_for([Success('{"value":"invalid"}'), Failure("repair failed"), original])
    asyncio.run(translator.translate("first"))
    assert asyncio.run(translator.translate("second")) is original


@pytest.mark.parametrize("response_text", ["not JSON", '{"value":}'])
def test_translator_retains_previous_candidate_when_repair_cannot_be_parsed(response_text: str):
    translator, model = translator_for([Success('{"value":"invalid"}'), Success(response_text)])
    result = asyncio.run(translator.translate("request"))
    assert isinstance(result, Failure)
    assert result.has_value
    assert result.value == {"value": "invalid"}
    assert result.response_text == response_text
    assert len(model.prompts) == 2


@pytest.mark.parametrize("response_text", ["not JSON", '{"value":}'])
def test_python_still_repairs_unparseable_output(response_text: str):
    translator, model = translator_for([Success(response_text), Success('{"value":42}')])
    assert asyncio.run(translator.translate("request")) == Success(Example(42))
    assert len(model.prompts) == 2
