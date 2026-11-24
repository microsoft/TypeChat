from copy import copy
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
    type_name: str
    schema_str: str
    _max_repair_attempts = 1

    def __init__(
        self,
        model: TypeChatLanguageModel,
        validator: TypeChatValidator[T],
        target_type: type[T],
        *, # keyword-only parameters follow
        use_legacy_prompt: bool = False,
        _raise_on_schema_errors: bool = True,
    ):
        """
        Args:
            model: The associated `TypeChatLanguageModel`.
            validator: The associated `TypeChatValidator[T]`.
            target_type: A runtime type object describing `T` - the expected shape of JSON data.
            use_legacy_prompt: Use the pre-0.3 combined user prompt and `_create_request_prompt` hook.
        """
        super().__init__()
        self.model = model
        self.validator = validator
        self.target_type = target_type
        self._use_legacy_prompt = use_legacy_prompt

        conversion_result = python_type_to_typescript_schema(target_type)

        if _raise_on_schema_errors and conversion_result.errors:
            error_text = "".join(f"\n- {error}" for error in conversion_result.errors)
            raise ValueError(f"Could not convert Python type to TypeScript schema: \n{error_text}")

        self.type_name = conversion_result.typescript_type_reference
        self.schema_str = conversion_result.typescript_schema_str

    async def translate(self, input: str, *, prompt_preamble: str | list[PromptSection] | None = None) -> Result[T]:
        """
        Translates a natural language request into an object of type `T`. If the JSON object returned by
        the language model fails to validate, repair attempts will be made up until `_max_repair_attempts`.
        The prompt for the subsequent attempts will include the diagnostics produced for the prior attempt.
        This often helps produce a valid instance.
        A failure retains the latest rejected value and available model response text. These may come
        from different attempts if a repair response couldn't be parsed.

        Args:
            input: A natural language request.
            prompt_preamble: Context placed before the current user message, after the default system
                             instructions. A nonempty string becomes one user message; a list keeps its roles.
        """

        messages: list[PromptSection] = []

        if not self._use_legacy_prompt:
            # Don't silently bypass a more specific legacy hook, including one assigned to this instance.
            for owner in (self, *type(self).__mro__):
                if "_create_system_prompt" in vars(owner):
                    break
                if "_create_request_prompt" in vars(owner):
                    raise ValueError(
                        "_create_request_prompt is a legacy hook. Pass use_legacy_prompt=True, or override "
                        + "_create_system_prompt(self) with application instructions only (no request or history)."
                    )
            messages.append({"role": "system", "content": self._create_system_prompt()})

        if prompt_preamble:
            if isinstance(prompt_preamble, str):
                prompt_preamble = [{"role": "user", "content": prompt_preamble}]
            messages.extend(prompt_preamble)

        user_prompt = self._create_request_prompt(input) if self._use_legacy_prompt else input
        messages.append({"role": "user", "content": user_prompt})

        num_repairs_attempted = 0
        last_failure: Failure | None = None
        while True:
            completion_response = await self.model.complete(messages)
            if isinstance(completion_response, Failure):
                if last_failure is None:
                    return completion_response
                failure = copy(completion_response)
                if not failure.has_value:
                    failure.value = last_failure.value
                if failure.response_text is None:
                    failure.response_text = last_failure.response_text
                return failure

            text_response = completion_response.value
            first_curly = text_response.find("{")
            last_curly = text_response.rfind("}") + 1
            failure: Failure
            if 0 <= first_curly < last_curly:
                trimmed_response = text_response[first_curly:last_curly]
                try:
                    parsed_response = pydantic_core.from_json(trimmed_response, allow_inf_nan=False, cache_strings=False)
                except ValueError as e:
                    failure = Failure(
                        f"Error: {e}\n\nAttempted to parse:\n\n{trimmed_response}",
                        response_text=text_response,
                    )
                else:
                    result = self.validator.validate_object(parsed_response)
                    if isinstance(result, Success):
                        return result
                    failure = copy(result)
                    if failure.response_text is None:
                        failure.response_text = text_response
                    if not failure.has_value:
                        failure.value = parsed_response
            else:
                failure = Failure(
                    f"Response did not contain any text resembling JSON.\nResponse was\n\n{text_response}",
                    response_text=text_response,
                )
            if not failure.has_value and last_failure is not None:
                failure.value = last_failure.value
            last_failure = failure
            if num_repairs_attempted >= self._max_repair_attempts:
                return failure
            num_repairs_attempted += 1
            messages.append({"role": "assistant", "content": text_response})
            messages.append({"role": "user", "content": self._create_repair_prompt(failure.message)})

    def _create_system_prompt(self) -> str:
        """Build application-owned instructions for this turn, without the request or conversation history."""
        return f"""
You are a service that translates user requests into JSON objects of type "{self.type_name}" according to the following TypeScript definitions:
```
{self.schema_str}
```
You translate each user request into a JSON object with 2 spaces of indentation and no properties with the value undefined.
"""

    def _create_request_prompt(self, intent: str) -> str:
        """Build the combined user message used only with use_legacy_prompt=True."""
        prompt = f"""
You are a service that translates user requests into JSON objects of type "{self.type_name}" according to the following TypeScript definitions:
```
{self.schema_str}
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
