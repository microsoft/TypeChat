from typing_extensions import Generic, TypeVar

import pydantic_core

from typechat._internal.model import PromptSection, TypeChatLanguageModel
from typechat._internal.result import Failure, Result, Success
from typechat._internal.ts_conversion import python_type_to_typescript_schema
from typechat._internal.validator import TypeChatValidator

T = TypeVar("T", covariant=True)

class TypeChatJsonTranslator(Generic[T]):
    """
    Represents an object that can translate natural language requests in JSON objects of the given type.
    """

    model: TypeChatLanguageModel
    validator: TypeChatValidator[T]
    target_type: type[T]
    _type_name: str
    _schema_str: str
    _max_repair_attempts = 1

    def __init__(
        self,
        model: TypeChatLanguageModel,
        validator: TypeChatValidator[T],
        target_type: type[T],
        *, # keyword-only parameters follow
        _raise_on_schema_errors: bool = True,
    ):
        """
        Args:
            model: The associated `TypeChatLanguageModel`.
            validator: The associated `TypeChatValidator[T]`.
            target_type: A runtime type object describing `T` - the expected shape of JSON data.
        """
        super().__init__()
        self.model = model
        self.validator = validator
        self.target_type = target_type

        conversion_result = python_type_to_typescript_schema(target_type)

        if _raise_on_schema_errors and conversion_result.errors:
            error_text = "".join(f"\n- {error}" for error in conversion_result.errors)
            raise ValueError(f"Could not convert Python type to TypeScript schema: \n{error_text}")

        self._type_name = conversion_result.typescript_type_reference
        self._schema_str = conversion_result.typescript_schema_str

    async def translate(self, input: str, *, prompt_preamble: str | list[PromptSection] | None = None) -> Result[T]:
        """
        Translates a natural language request into an object of type `T`. If the JSON object returned by
        the language model fails to validate, repair attempts will be made up until `_max_repair_attempts`.
        The prompt for the subsequent attempts will include the diagnostics produced for the prior attempt.
        This often helps produce a valid instance.

        Args:
            input: A natural language request.
            prompt_preamble: An optional string or list of prompt sections to prepend to the generated prompt.\
                             If a string is given, it is converted to a single "user" role prompt section.
        """

        messages: list[PromptSection] = []

        if prompt_preamble:
            if isinstance(prompt_preamble, str):
                prompt_preamble = [{"role": "user", "content": prompt_preamble}]
            messages.extend(prompt_preamble)

        messages.append({"role": "user", "content": self._create_request_prompt(input)})

        num_repairs_attempted = 0
        while True:
            completion_response = await self.model.complete(messages)
            if isinstance(completion_response, Failure):
                return completion_response

            text_response = completion_response.value
            first_curly = text_response.find("{")
            last_curly = text_response.rfind("}") + 1
            error_message: str
            if 0 <= first_curly < last_curly:
                trimmed_response = text_response[first_curly:last_curly]
                parsed_response = pydantic_core.from_json(trimmed_response, allow_inf_nan=False, cache_strings=False)
                result = self.validator.validate_object(parsed_response)
                if isinstance(result, Success):
                    return result
                error_message = result.message
            else:
                error_message = "Response did not contain any text resembling JSON."
            if num_repairs_attempted >= self._max_repair_attempts:
                return Failure(error_message)
            num_repairs_attempted += 1
            messages.append({"role": "assistant", "content": text_response})
            messages.append({"role": "user", "content": self._create_repair_prompt(error_message)})

    def _create_request_prompt(self, intent: str) -> str:
        prompt = f"""
You are a service that translates user requests into JSON objects of type "{self._type_name}" according to the following TypeScript definitions:
```
{self._schema_str}
```
The following is a user request:
'''
{intent}
'''
The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
"""
        return prompt

    def _create_repair_prompt(self, validation_error: str) -> str:
        prompt = f"""
The above JSON object is invalid for the following reason:
'''
{validation_error}
'''
The following is a revised JSON object:
"""
        return prompt
