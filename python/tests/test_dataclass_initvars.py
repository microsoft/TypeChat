import asyncio
import re
from dataclasses import InitVar, dataclass
from typing import Annotated, Any

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
class InitVariables:
    name: str
    repeat: InitVar[int]
    separator: InitVar[Annotated[str | None, "Placed between the copies."]] = None

    def __post_init__(self, repeat: int, separator: str | None) -> None:
        self.name = (separator or "").join([self.name] * repeat)


@dataclass
class InheritedInitVariables(InitVariables):
    extra: str = "fake"


@dataclass
class BareInitVariable:
    name: str
    anything: InitVar = None  # type: ignore


@dataclass
class QuotedInitVariables:
    name: str
    repeat: InitVar["int"]
    tags: InitVar["list[Tag] | None"] = None

    def __post_init__(self, repeat: int, tags: "list[Tag] | None") -> None:
        self.name = self.name * repeat


@dataclass
class Tag:
    label: str


@dataclass
class InheritedQuotedInitVariables(QuotedInitVariables):
    extra: str = "fake"


class CapturingModel(TypeChatLanguageModel):
    def __init__(self) -> None:
        super().__init__()
        self.prompt: str | list[PromptSection] = ""

    @override
    async def complete(self, prompt: str | list[PromptSection]) -> Result[str]:
        self.prompt = prompt
        return Success('{"name": "ab", "repeat": 2}')


@pytest.mark.parametrize("target", [InitVariables, InheritedInitVariables, BareInitVariable])
def test_init_variables_match_constructor_arguments(target: type[Any]) -> None:
    schema = python_type_to_typescript_schema(target)
    assert not schema.errors
    emitted = set(re.findall(r"^    (\w+)\??:", schema.typescript_schema_str, re.MULTILINE))
    assert emitted == set(TypeAdapter(target).json_schema()["properties"])


def test_init_variables_use_their_wrapped_type() -> None:
    schema = python_type_to_typescript_schema(InitVariables).typescript_schema_str
    assert "    repeat: number;\n" in schema
    assert "    // Placed between the copies.\n    separator?: string | null;\n" in schema

    bare_schema = python_type_to_typescript_schema(BareInitVariable).typescript_schema_str
    assert "    anything?: any;\n" in bare_schema


@pytest.mark.parametrize("target", [QuotedInitVariables, InheritedQuotedInitVariables])
def test_quoted_init_variable_types_are_resolved(target: type[Any]) -> None:
    result = python_type_to_typescript_schema(target)
    assert not result.errors
    schema = result.typescript_schema_str
    assert "    repeat: number;\n" in schema
    assert "    tags?: Tag[] | null;\n" in schema


def test_local_init_variable_can_refer_to_its_own_class() -> None:
    @dataclass
    class Node:
        name: str
        parent: InitVar["Node | None"] = None

    result = python_type_to_typescript_schema(Node)
    assert not result.errors
    assert "    parent?: Node | null;\n" in result.typescript_schema_str


@pytest.mark.parametrize(
    "target",
    [InitVariables, InheritedInitVariables, QuotedInitVariables, InheritedQuotedInitVariables],
)
def test_translator_accepts_init_variables(target: type[Any]) -> None:
    validator = TypeChatValidator(target)
    model = CapturingModel()
    translator = TypeChatJsonTranslator(model, validator, target)
    result = asyncio.run(translator.translate("Repeat ab twice."))
    assert isinstance(result, Success)
    assert result.value.name == "abab"
    assert "repeat: number;" in str(model.prompt)
    assert isinstance(validator.validate_object({"name": "ab"}), Failure)
