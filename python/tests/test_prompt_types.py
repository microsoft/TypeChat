from inspect import getsource
from pathlib import Path
from typing import TYPE_CHECKING

from typing_extensions import Literal, TypedDict, assert_type

from typechat import (
    ChatCompletionClient,
    ImagePromptContent,
    ImageUrl,
    PromptContent,
    PromptSection,
    Result,
    TextPromptContent,
    TypeChatJsonTranslator,
    TypeChatLanguageModel,
    TypeChatValidator,
    create_azure_openai_language_model,
    create_language_model,
    create_openai_language_model,
    create_openai_language_model_from_client,
)


class ImageDescription(TypedDict):
    description: str


async def inspect_images(
    model: TypeChatLanguageModel, image_base64: str
) -> tuple[Result[str], Result[ImageDescription]]:
    context: list[PromptSection] = [
        {"role": "user", "content": [
            {"type": "text", "text": "Use these images as context."},
            {"type": "image_url", "image_url": {"url": "https://example.com/photo.png"}},
            {"type": "image_url", "image_url": {
                "url": f"data:image/png;base64,{image_base64}",
                "detail": "low",
            }},
        ]},
    ]
    text = await model.complete(context)
    translator = TypeChatJsonTranslator(model, TypeChatValidator(ImageDescription), ImageDescription)
    data = await translator.translate("Describe the images.", prompt_preamble=context)
    return text, data


def test_public_prompt_types_retain_dictionary_construction():
    text: TextPromptContent = {"type": "text", "text": "Describe this image."}
    image_url: ImageUrl = {"url": "https://example.com/photo.png"}
    image: ImagePromptContent = {"type": "image_url", "image_url": image_url}
    content: PromptContent = [text, image]
    section = PromptSection(role="user", content=content)
    assert_type(section, PromptSection)
    assert_type(text["type"], Literal["text"])
    assert_type(text["text"], str)
    assert_type(image["type"], Literal["image_url"])
    assert_type(image["image_url"], ImageUrl)
    assert section == {"role": "user", "content": [text, image]}
    assert "detail" not in image_url


def test_documentation_examples_match_typechecked_functions():
    root = Path(__file__).resolve().parents[2]
    example = getsource(ImageDescription).rstrip() + "\n\n\n" + getsource(inspect_images).rstrip()
    for path in (root / "python" / "README.md", root / "site" / "src" / "docs" / "python" / "basic-usage.md"):
        assert example in path.read_text(encoding="utf-8")


if TYPE_CHECKING:
    missing_text_tag: TextPromptContent = {"text": "text"}  # type: ignore
    missing_text: TextPromptContent = {"type": "text"}  # type: ignore
    wrong_text: TextPromptContent = {"type": "text", "text": 42}  # type: ignore
    unknown_tag: TextPromptContent = {"type": "audio", "text": "text"}  # type: ignore
    missing_image: ImagePromptContent = {"type": "image_url"}  # type: ignore
    wrong_image: ImagePromptContent = {"type": "image_url", "image_url": "https://example.com"}  # type: ignore
    missing_url: ImageUrl = {"detail": "auto"}  # type: ignore
    wrong_url: ImageUrl = {"url": 42}  # type: ignore
    wrong_detail: ImageUrl = {"url": "https://example.com", "detail": "medium"}  # type: ignore
    bare_part: PromptContent = ["text"]  # type: ignore
    wrong_role: PromptSection = {"role": "tool", "content": "text"}  # type: ignore

    async def check_completion_and_request_types(
        model: TypeChatLanguageModel,
        translator: TypeChatJsonTranslator[ImageDescription],
        client: ChatCompletionClient,
    ) -> None:
        sections: list[PromptSection] = [{"role": "user", "content": "existing text"}]
        assert_type(await model.complete("existing text"), Result[str])
        assert_type(await model.complete(sections), Result[str])
        assert_type(await translator.translate("existing text"), Result[ImageDescription])
        assert_type(
            await translator.translate("existing text", prompt_preamble="context"),
            Result[ImageDescription],
        )
        assert_type(
            await translator.translate("existing text", prompt_preamble=sections),
            Result[ImageDescription],
        )
        await translator.translate(sections)  # type: ignore
        create_language_model({}, temperature="default")  # type: ignore
        create_openai_language_model("key", "model", temperature="default")  # type: ignore
        create_azure_openai_language_model("key", "https://example.com", temperature="default")  # type: ignore
        create_openai_language_model_from_client(client, "model", temperature="default")  # type: ignore
