import json
from textwrap import indent
from typing_extensions import Any, Callable, Awaitable, TypedDict, Annotated
from typechat import Failure, TypeChatValidator, TypeChatModel, TypeChatTranslator


class ClassificationItem(TypedDict):
    name: str
    description: str
    handler: Callable[[str], Awaitable[Any]]


TextClassification = TypedDict("TextClassification", {"class": Annotated[str, "Use this for the classification"]})


class TextRequestRouter:
    _current_agents: dict[str, ClassificationItem]
    _validator: TypeChatValidator[TextClassification]
    _translator: TypeChatTranslator[TextClassification]

    def __init__(self, model: TypeChatModel):
        super().__init__()
        self._validator = TypeChatValidator(TextClassification)
        self._translator = TypeChatTranslator(model, self._validator, TextClassification)
        self._current_agents = {}

    def register_agent(self, name: str, description: str, handler: Callable[[str], Awaitable[Any]]):
        agent = ClassificationItem(name=name, description=description, handler=handler)
        self._current_agents[name] = agent

    async def route_request(self, line: str):
        classes_str = json.dumps(self._current_agents, indent=2, default=lambda o: None, allow_nan=False)
        classes_str = indent(classes_str, "            ")

        prompt_fragment = F"""
            Classify ""{line}"" using the following classification table:
            '''
            {classes_str}
            '''
            """

        result = await self._translator.translate(prompt_fragment)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print(f"The target class is {result['class']}")
            target = self._current_agents[result["class"]]
            await target.get("handler")(line)
