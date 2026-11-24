import json
from typing_extensions import Any, Callable, Awaitable, TypedDict, Annotated
from typechat import Failure, TypeChatValidator, TypeChatLanguageModel, TypeChatJsonTranslator


class AgentInfo(TypedDict):
    name: str
    description: str
    handler: Callable[[str], Awaitable[Any]]


class TaskClassification(TypedDict):
    task_kind: Annotated[str, "Describe the kind of task to perform."]


class TextRequestRouter:
    _current_agents: dict[str, AgentInfo]
    _validator: TypeChatValidator[TaskClassification]
    _translator: TypeChatJsonTranslator[TaskClassification]

    def __init__(self, model: TypeChatLanguageModel):
        super().__init__()
        self._validator = TypeChatValidator(TaskClassification)
        self._translator = TypeChatJsonTranslator(model, self._validator, TaskClassification)
        self._current_agents = {}

    def register_agent(self, name: str, description: str, handler: Callable[[str], Awaitable[Any]]):
        agent = AgentInfo(name=name, description=description, handler=handler)
        self._current_agents[name] = agent

    async def route_request(self, line: str):
        classes = {name: agent["description"] for name, agent in self._current_agents.items()}
        result = await self._translator.translate(line, prompt_preamble=[{
            "role": "system",
            "content": f"Classify the user request using this table of registered agents:\n{json.dumps(classes, indent=2)}",
        }])
        if isinstance(result, Failure):
            print("Translation Failed ❌")
            print(f"Context: {result.message}")
        else:
            result = result.value
            print("Translation Succeeded! ✅\n")
            print(f"The target class is {result['task_kind']}")
            target = self._current_agents[result["task_kind"]]
            await target.get("handler")(line)
