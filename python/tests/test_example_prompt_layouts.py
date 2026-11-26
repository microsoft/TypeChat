import asyncio
import json
from datetime import datetime
from unittest.mock import AsyncMock, Mock

import pytest
from examples.healthData import translator as health
from examples.healthData.schema import HealthDataResponse
from examples.math.program import TypeChatProgramTranslator, TypeChatProgramValidator, evaluate_json_program, program_schema_text
from examples.math.schema import MathAPI
from examples.multiSchema.router import TextRequestRouter
from typechat import Failure, PromptSection, Success, TypeChatValidator, python_type_to_typescript_schema

from .test_translator import FixedModel


@pytest.mark.parametrize("legacy", [False, True], ids=["schema-first", "legacy"])
def test_math_uses_program_and_api_schemas_and_repairs_programs(legacy: bool):
    request = "  Add two and three.\n"
    rejected = 'Not a program:\n{"answer": 5}'
    program = {"@steps": [{"@func": "add", "@args": [2, 3]}]}
    model = FixedModel([rejected, json.dumps(program)])
    translator = TypeChatProgramTranslator(model, TypeChatProgramValidator(), MathAPI, use_legacy_prompt=legacy)
    result = asyncio.run(translator.translate(request))
    assert isinstance(result, Success) and result.value == program
    add = AsyncMock(return_value=5)
    assert asyncio.run(evaluate_json_program(result.value, add)) == 5
    add.assert_awaited_once_with("add", [2, 3])

    initial = model.request()
    instructions = initial[0]["content"]
    assert isinstance(instructions, str) and program_schema_text in instructions
    assert python_type_to_typescript_schema(MathAPI).typescript_schema_str in instructions
    assert "JSON program object with 2 spaces of indentation" in instructions
    if legacy:
        assert len(initial) == 1 and initial[0]["role"] == "user"
        assert f"The following is a user request:\n'''\n{request}\n'''" in instructions
    else:
        assert initial == [{"role": "system", "content": instructions}, {"role": "user", "content": request}]
        assert request not in instructions
    repair = model.request(1)
    assert repair[:-2] == initial
    assert repair[-2] == {"role": "assistant", "content": rejected}
    assert repair[-1]["role"] == "user"
    assert "The JSON program object is invalid" in repair[-1]["content"]
    assert "must have an array of @steps" in repair[-1]["content"]


def test_health_refreshes_clock_and_replays_only_validated_assistant_results(monkeypatch: pytest.MonkeyPatch):
    clock = Mock()
    clock.now.side_effect = [datetime(2026, 1, 1, 23, 59, 59), datetime(2026, 1, 2, 0, 1), datetime(2026, 1, 3, 12, 30)]
    monkeypatch.setattr(health, "datetime", clock)
    accepted = {"message": "Validated assistant result."}
    rejected = '{"message": 42}'
    model = FixedModel([json.dumps({**accepted, "extra": "Not validated."}), rejected, "Not JSON.", "{}"])
    instructions = "Application-owned health instructions."
    translator = health.TranslatorWithHistory(model, TypeChatValidator(HealthDataResponse), HealthDataResponse, instructions)

    first = asyncio.run(translator.translate("First entry."))
    assert isinstance(first, Success) and first.value == accepted
    first.value["message"] = "Changed by caller after validation."
    failure = asyncio.run(translator.translate("Second entry.", prompt_preamble="External context."))
    assert isinstance(failure, Failure)
    assert failure.value == {"message": 42} and failure.response_text == "Not JSON."
    preamble: list[PromptSection] = [{"role": "user", "content": "Caller-supplied history."}]
    original = preamble.copy()
    assert asyncio.run(translator.translate("Third entry.", prompt_preamble=preamble)) == Success({})

    first_prompt, failed_prompt, repair, third_prompt = [model.request(i) for i in range(4)]
    assert clock.now.call_count == 3
    for prompt, stamp in [(first_prompt, "01 01, 2026 CURRENT TIME: 23:59:59"),
                          (failed_prompt, "01 02, 2026 CURRENT TIME: 00:01:00"),
                          (third_prompt, "01 03, 2026 CURRENT TIME: 12:30:00")]:
        system = prompt[0]["content"]
        assert prompt[0]["role"] == "system" and isinstance(system, str)
        assert translator.schema_str in system and instructions in system and stamp in system
        for text in ("First entry.", "Second entry.", "Third entry.", accepted["message"], "Not validated.",
                     rejected, "Not JSON.", "External context.", "Caller-supplied history."):
            assert text not in system
        assert all(instructions not in message["content"] for message in prompt[1:])
    history = {"role": "assistant", "content": json.dumps(accepted, indent=2)}
    assert first_prompt[1:] == [{"role": "user", "content": "First entry."}]
    assert failed_prompt[1:] == [{"role": "user", "content": "External context."}, history,
                                 {"role": "user", "content": "Second entry."}]
    assert repair[:-2] == failed_prompt and repair[-2] == {"role": "assistant", "content": rejected}
    assert third_prompt[1:] == [*original, history, {"role": "user", "content": "Third entry."}]
    assert preamble == original


def test_health_explicit_legacy_keeps_clock_and_history_in_combined_user_prompt(monkeypatch: pytest.MonkeyPatch):
    clock = Mock()
    clock.now.side_effect = [datetime(2026, 1, 1, 17), datetime(2026, 1, 2, 18)]
    monkeypatch.setattr(health, "datetime", clock)
    model = FixedModel(['{"message":"Previous answer."}', "{}"])
    translator = health.TranslatorWithHistory(
        model, TypeChatValidator(HealthDataResponse), HealthDataResponse, "Health instructions.", use_legacy_prompt=True,
    )
    asyncio.run(translator.translate("First request."))
    asyncio.run(translator.translate("Next request.", prompt_preamble="Caller context."))

    context, combined = model.request(1)
    assert context == {"role": "user", "content": "Caller context."}
    assert combined["role"] == "user" and isinstance(combined["content"], str)
    text = combined["content"]
    assert "CURRENT TIME: 18:00:00" in text and "Health instructions." in text
    assert json.dumps([{"source": "assistant", "body": {"message": "Previous answer."}}], indent=2) in text
    assert "The following is a user request:\n'''\nNext request.\n'''" in text
    assert "First request." not in text


def test_router_keeps_registered_table_separate_from_verbatim_request():
    model = FixedModel(['{"task_kind":"Math"}'])
    handler = AsyncMock()
    router = TextRequestRouter(model)
    router.register_agent("Math", "Perform arithmetic.", handler)
    request = "  Add four and five.\n"
    asyncio.run(router.route_request(request))
    handler.assert_awaited_once_with(request)
    schema, table, user = model.request()
    assert schema["role"] == table["role"] == "system"
    assert "Perform arithmetic." in table["content"]
    assert request not in schema["content"] and request not in table["content"]
    assert user == {"role": "user", "content": request}
