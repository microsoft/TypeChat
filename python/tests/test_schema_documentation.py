from pathlib import Path
from textwrap import dedent
from types import ModuleType

import pytest

from typechat import Failure, Success, TypeChatValidator, python_type_to_typescript_schema


@pytest.mark.parametrize("example_index", [0, 1], ids=["Doc", "plain-string"])
def test_documented_typeddict_examples(example_index: int) -> None:
    root = Path(__file__).resolve().parents[2]
    guide = root / "site" / "src" / "docs" / "python" / "basic-usage.md"
    code_blocks = [block.split("```", 1)[0] for block in guide.read_text(encoding="utf-8").split("```py\n")[1:]]
    examples = [block for block in code_blocks if "class Sentiment(TypedDict):" in block]
    assert len(examples) == 2

    schema = ModuleType("schema")
    exec(examples[example_index], schema.__dict__)
    sentiment_type = schema.__dict__["Sentiment"]
    assert isinstance(sentiment_type, type)

    result = python_type_to_typescript_schema(sentiment_type)
    assert result.errors == []
    assert result.typescript_type_reference == "Sentiment"
    assert result.typescript_schema_str == dedent("""
        interface Sentiment {
            // The sentiment of the user input.
            sentiment: "negative" | "neutral" | "positive";
        }
    """).lstrip()

    validator = TypeChatValidator[dict[str, str]](sentiment_type)
    for sentiment in ("negative", "neutral", "positive"):
        assert validator.validate_object({"sentiment": sentiment}) == Success({"sentiment": sentiment})

    invalid = validator.validate_object({"sentiment": "mixed"})
    assert isinstance(invalid, Failure)
    assert "sentiment" in invalid.message
    assert "negative" in invalid.message
    assert "neutral" in invalid.message
    assert "positive" in invalid.message
    assert invalid.value == {"sentiment": "mixed"}

    missing = validator.validate_object({})
    assert isinstance(missing, Failure)
    assert "sentiment" in missing.message
    assert "Field required" in missing.message
