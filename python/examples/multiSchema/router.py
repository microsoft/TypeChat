import json
from typing_extensions import Any, Callable, Awaitable, TypedDict, Annotated
from typechat import Failure, TypeChatValidator, TypeChatModel, TypeChatTranslator


class AgentInfo(TypedDict):
    name: str
    description: str
    handler: Callable[[str], Awaitable[Any]]


class TaskClassification(TypedDict):
    task_kind: Annotated[str, "Describe the kind of task to perform."]


class TextRequestRouter:
    _current_agents: dict[str, AgentInfo]
    _validator: TypeChatValidator[TaskClassification]
    _translator: TypeChatTranslator[TaskClassification]

    def __init__(self, model: TypeChatModel):
        super().__init__()
        self._validator = TypeChatValidator(TaskClassification)
        self._translator = TypeChatTranslator(model, self._validator, TaskClassification)
        self._current_agents = {}

    def register_agent(self, name: str, description: str, handler: Callable[[str], Awaitable[Any]]):
        agent = AgentInfo(name=name, description=description, handler=handler)
        self._current_agents[name] = agent

    async def route_request(self, line: str):
        classes_str = json.dumps(self._current_agents, indent=2, default=lambda o: None, allow_nan=False)

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
            print(f"The target class is {result['task_kind']}")
            target = self._current_agents[result["task_kind"]]
            await target.get("handler")(line)
