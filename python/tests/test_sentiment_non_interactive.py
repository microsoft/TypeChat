import asyncio
import json
import runpy
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from examples.sentiment import non_interactive
from typechat import Failure, PromptSection, Result, TypeChatJsonTranslator, TypeChatLanguageModel, TypeChatValidator

from .test_translator import FixedModel


@pytest.fixture(autouse=True)
def forbid_interactive_input(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_if_prompted(_prompt: str = "") -> str:
        pytest.fail("The non-interactive example must not prompt for input.")

    monkeypatch.setattr("builtins.input", fail_if_prompted)


def create_translator(model: TypeChatLanguageModel) -> TypeChatJsonTranslator[non_interactive.Sentiment]:
    validator = TypeChatValidator(non_interactive.Sentiment)
    return TypeChatJsonTranslator(model, validator, non_interactive.Sentiment)


@pytest.mark.parametrize("sentiment", ["negative", "neutral", "positive"])
def test_classify_returns_validated_sentiment(sentiment: str) -> None:
    model = FixedModel([json.dumps({"sentiment": sentiment})])
    result = asyncio.run(non_interactive.classify_sentiment("Classify this text.", create_translator(model)))

    assert isinstance(result, non_interactive.Sentiment)
    assert result.sentiment == sentiment
    request = model.conversation[0]["payload"]
    assert isinstance(request, list)
    assert "Classify this text." in request[0]["content"]


def test_classify_reuses_translator_for_independent_requests() -> None:
    model = FixedModel(['{"sentiment": "positive"}', '{"sentiment": "negative"}'])
    translator = create_translator(model)

    async def classify_both() -> tuple[non_interactive.Sentiment, non_interactive.Sentiment]:
        first = await non_interactive.classify_sentiment("I love this!", translator)
        second = await non_interactive.classify_sentiment("I hate this!", translator)
        return first, second

    first, second = asyncio.run(classify_both())
    assert first.sentiment == "positive"
    assert second.sentiment == "negative"
    first_request = model.conversation[0]["payload"]
    second_request = model.conversation[2]["payload"]
    assert isinstance(first_request, list)
    assert isinstance(second_request, list)
    assert len(first_request) == len(second_request) == 1
    assert "I love this!" in first_request[0]["content"]
    assert "I hate this!" in second_request[0]["content"]


def test_classify_repairs_invalid_sentiment() -> None:
    model = FixedModel(['{"sentiment": "mixed"}', '{"sentiment": "positive"}'])
    result = asyncio.run(non_interactive.classify_sentiment("TypeChat is awesome!", create_translator(model)))

    assert result.sentiment == "positive"
    assert len(model.conversation) == 4


def test_classify_surfaces_model_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    model = FixedModel([])

    async def complete(_prompt: str | list[PromptSection]) -> Result[str]:
        return Failure("Model unavailable")

    monkeypatch.setattr(model, "complete", complete)
    with pytest.raises(RuntimeError, match="Model unavailable"):
        asyncio.run(non_interactive.classify_sentiment("Classify this text.", create_translator(model)))


@pytest.mark.parametrize(
    ("responses", "expected"),
    [
        (['{"sentiment": "positive"}'], {"sentiment": "positive"}),
        (['{"sentiment": "mixed"}', '{"sentiment": "mixed"}'], None),
    ],
)
def test_main_closes_model_and_reports_result(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    responses: list[str],
    expected: dict[str, str] | None,
) -> None:
    model = FixedModel(responses)
    closed = False

    @asynccontextmanager
    async def create_model(settings: dict[str, str | None]) -> AsyncIterator[FixedModel]:
        nonlocal closed
        assert settings["TYPECHAT_NON_INTERACTIVE_TEST"] == "process"
        assert settings["TYPECHAT_NON_INTERACTIVE_FILE_TEST"] == "file"
        try:
            yield model
        finally:
            closed = True

    def dotenv_values() -> dict[str, str | None]:
        return {
            "TYPECHAT_NON_INTERACTIVE_TEST": "file",
            "TYPECHAT_NON_INTERACTIVE_FILE_TEST": "file",
        }

    monkeypatch.setenv("TYPECHAT_NON_INTERACTIVE_TEST", "process")
    monkeypatch.delenv("TYPECHAT_NON_INTERACTIVE_FILE_TEST", raising=False)
    monkeypatch.setattr(non_interactive, "dotenv_values", dotenv_values)
    monkeypatch.setattr(non_interactive, "create_language_model", create_model)

    if expected is None:
        with pytest.raises(RuntimeError, match="negative.*neutral.*positive"):
            asyncio.run(non_interactive.main("TypeChat is awesome!"))
    else:
        asyncio.run(non_interactive.main("TypeChat is awesome!"))

    assert closed
    output = capsys.readouterr()
    assert output.err == ""
    if expected is None:
        assert output.out == ""
    else:
        assert json.loads(output.out) == expected


def test_script_requires_text(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", [str(non_interactive.__file__)])
    with pytest.raises(SystemExit) as error:
        runpy.run_path(str(non_interactive.__file__), run_name="__main__")

    assert error.value.code == 2
    assert "the following arguments are required: text" in capsys.readouterr().err


def test_quickstart_matches_runnable_example() -> None:
    root = Path(__file__).resolve().parents[2]
    quickstart = root / "site" / "src" / "docs" / "python" / "non-interactive.md"
    documented_code = quickstart.read_text(encoding="utf-8").split("```python\n", 1)[1].split("```", 1)[0]

    assert documented_code == Path(non_interactive.__file__).read_text(encoding="utf-8")
