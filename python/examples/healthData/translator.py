import json
from datetime import datetime

from pydantic_core import to_jsonable_python
from typing_extensions import TypeVar, override

from typechat import TypeChatValidator, TypeChatLanguageModel, TypeChatJsonTranslator, Result, Success, PromptSection

T = TypeVar("T", covariant=True)


def _clock_instructions() -> str:
    now = datetime.now()
    return f"""Use precise date and times RELATIVE TO CURRENT DATE: {now:%A, %m %d, %Y} CURRENT TIME: {now:%H:%M:%S}
Also turn ranges like next week and next month into precise dates"""


class TranslatorWithHistory(TypeChatJsonTranslator[T]):
    def __init__(
        self, model: TypeChatLanguageModel, validator: TypeChatValidator[T], target_type: type[T],
        additional_agent_instructions: str, *, use_legacy_prompt: bool = False,
    ):
        super().__init__(model, validator, target_type, use_legacy_prompt=use_legacy_prompt)
        self._chat_history: list[object] = []
        self._additional_agent_instructions = additional_agent_instructions

    @override
    async def translate(self, input: str, *, prompt_preamble: str | list[PromptSection] | None = None) -> Result[T]:
        if not self._use_legacy_prompt and self._chat_history:
            context: list[PromptSection] = []
            if isinstance(prompt_preamble, str):
                if prompt_preamble:
                    context.append({"role": "user", "content": prompt_preamble})
            elif prompt_preamble:
                context.extend(prompt_preamble)
            for body in self._chat_history:
                context.append({"role": "assistant", "content": json.dumps(body, indent=2, allow_nan=False)})
            prompt_preamble = context

        result = await super().translate(input=input, prompt_preamble=prompt_preamble)
        if isinstance(result, Success):
            self._chat_history.append(to_jsonable_python(result.value))
        return result

    @override
    def _create_system_prompt(self) -> str:
        return f"{super()._create_system_prompt()}\n{_clock_instructions()}\n\n{self._additional_agent_instructions}"

    @override
    def _create_request_prompt(self, intent: str) -> str:
        history = [{"source": "assistant", "body": body} for body in self._chat_history]
        history_str = json.dumps(history, indent=2, allow_nan=False)

        prompt = F"""
user: You are a service that translates user requests into JSON objects of type  "{self.type_name}" according to the following TypeScript definitions:
'''
{self.schema_str}
'''

user:
{_clock_instructions()}

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
