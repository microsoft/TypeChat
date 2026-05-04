import json
from typing_extensions import TypeVar, Any, override, TypedDict, Literal

from typechat import TypeChatValidator, TypeChatLanguageModel, TypeChatJsonTranslator, Result, Failure, PromptSection

from datetime import datetime

T = TypeVar("T", covariant=True)


class ChatMessage(TypedDict):
    source: Literal["system", "user", "assistant"]
    body: Any


class TranslatorWithHistory(TypeChatJsonTranslator[T]):
    _chat_history: list[ChatMessage]
    _max_prompt_length: int
    _additional_agent_instructions: str

    def __init__(
        self, model: TypeChatLanguageModel, validator: TypeChatValidator[T], target_type: type[T], additional_agent_instructions: str
    ):
        super().__init__(model=model, validator=validator, target_type=target_type)
        self._chat_history = []
        self._max_prompt_length = 2048
        self._additional_agent_instructions = additional_agent_instructions

    @override
    async def translate(self, input: str, *, prompt_preamble: str | list[PromptSection] | None = None) -> Result[T]:
        result = await super().translate(input=input, prompt_preamble=prompt_preamble)
        if not isinstance(result, Failure):
            self._chat_history.append(ChatMessage(source="assistant", body=result.value))
        return result

    @override
    def _create_request_prompt(self, intent: str) -> str:
        # TODO: drop history entries if we exceed the max_prompt_length
        history_str = json.dumps(self._chat_history, indent=2, default=lambda o: None, allow_nan=False)

        now = datetime.now()

        prompt = F"""
user: You are a service that translates user requests into JSON objects of type  "{self.type_name}" according to the following TypeScript definitions:
'''
{self.schema_str}
'''

user:
Use precise date and times RELATIVE TO CURRENT DATE: {now.strftime('%A, %m %d, %Y')} CURRENT TIME: {now.strftime("%H:%M:%S")}
Also turn ranges like next week and next month into precise dates

user:
{self._additional_agent_instructions}

system:
IMPORTANT CONTEXT for the user request:
{history_str}

user:
The following is a user request:
'''
{intent}
'''
    The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
"""
        return prompt
