import json
from textwrap import dedent, indent
from typing import TypeVar, Any, override, Callable

from typechat import TypeChatValidator, TypeChatModel, TypeChatTranslator

T = TypeVar("T", covariant=True)

from typing import TypedDict, Annotated, Awaitable


class ClassificationItem(TypedDict):
    name: str
    description: str
    handler: Callable[[str], Awaitable[Any]]


TextClassification = TypedDict("TextClassification", {"class": Annotated[str, "Use this for the classification"]})


class TextClassiferTranslator(TypeChatTranslator[T]):
    _current_options: list[ClassificationItem]

    def __init__(self, model: TypeChatModel, validator: TypeChatValidator[T], target_type: type[T]):
        super().__init__(model=model, validator=validator, target_type=target_type)
        self._current_options = []

    @property
    def classes(self) -> list[ClassificationItem]:
        return self._current_options

    @override
    def _create_request_prompt(self, intent: str) -> str:
        classes_str = json.dumps(self._current_options, indent=2, default=lambda o: None, allow_nan=False)
        classes_str = indent(classes_str, "            ")

        schema_str = indent(self._schema_str, "            ")

        prompt = F"""
            user: You are a service that translates user requests into JSON objects of type "TextClassification" according to the following TypeScript definitions:
            '''
            {schema_str}
            '''
 
            The following is a user request:
            
            Classify ""{intent}"" using the following classification table:
            '''
            {classes_str}
            '''
            The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
            """
        prompt = dedent(prompt)
        return prompt
