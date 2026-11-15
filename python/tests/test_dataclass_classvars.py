import asyncio
import re
from dataclasses import dataclass, fields
from typing import Any, ClassVar

import pytest
from pydantic import TypeAdapter
from typing_extensions import override

from typechat import (
    Failure,
    PromptSection,
    Result,
    Success,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
    TypeChatValidator,
    python_type_to_typescript_schema,
)


@dataclass
class ClassVariables:
    value: int
    shared: ClassVar[str]
    defaulted: ClassVar[int] = 1


@dataclass
class InheritedVariables(ClassVariables):
    extra: str = "fake"


@dataclass
class BareVariable:
    value: int
    shared: ClassVar = "fake class data"


class CapturingModel(TypeChatLanguageModel):
    def __init__(self) -> None:
        super().__init__()
        self.prompt: str | list[PromptSection] = ""

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Result[str]:
        self.prompt = prompt
        return Success('{"value": 1}')


@pytest.mark.parametrize("target", [ClassVariables, InheritedVariables, BareVariable])
def test_class_variables_match_instance_fields(target: type[Any]) -> None:
    schema = python_type_to_typescript_schema(target)
    assert not schema.errors
    emitted = set(re.findall(r"^    (\w+)\??:", schema.typescript_schema_str, re.MULTILINE))
    assert emitted == {item.name for item in fields(target)}
    assert emitted == set(TypeAdapter(target).json_schema()["properties"])


@pytest.mark.parametrize("target", [ClassVariables, InheritedVariables, BareVariable])
def test_translator_uses_instance_schema(target: type[Any]) -> None:
    validator = TypeChatValidator(target)
    model = CapturingModel()
    translator = TypeChatJsonTranslator(model, validator, target)
    result = asyncio.run(translator.translate("Return value 1."))
    assert isinstance(result, Success)
    assert result.value.value == 1
    assert "shared" not in str(model.prompt)
    assert "defaulted" not in str(model.prompt)
    assert isinstance(validator.validate_object({"value": "fake invalid integer"}), Failure)
