from typing import Any, Callable, Awaitable, Dict
from typechat import Failure, TypeChatValidator, TypeChatModel
from translator import TextClassiferTranslator, TextClassification, ClassificationItem


class TextRequestRouter:
    _current_agents: Dict[str, ClassificationItem]
    _validator: TypeChatValidator[TextClassification]
    _translator: TextClassiferTranslator[TextClassification]

    def __init__(self, model: TypeChatModel):
        super().__init__()
        self._validator = TypeChatValidator(TextClassification)
        self._translator = TextClassiferTranslator(model, self._validator, TextClassification)

        self._current_agents = {}

    def register_agent(self, name: str, description: str, handler: Callable[[str], Awaitable[Any]]):
        agent = ClassificationItem(name=name, description=description, handler=handler)
        self._current_agents[name] = agent
        self._translator.classes.append(agent)

    async def route_request(self, line: str):
        result = await self._translator.translate(line)
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print(f"The target class is {result['class']}")
            target = self._current_agents[result["class"]]
            await target.get("handler")(line)
