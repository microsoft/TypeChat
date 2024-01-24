from typing_extensions import Generic, TypeVar

from typechat._internal.model import TypeChatModel
from typechat._internal.result import Failure, Result, Success
from typechat._internal.ts_conversion import python_type_to_typescript_schema
from typechat._internal.validator import TypeChatValidator

T = TypeVar("T", covariant=True)

class TypeChatTranslator(Generic[T]):
    model: TypeChatModel
    validator: TypeChatValidator[T]
    target_type: type[T]
    _type_name: str
    _schema_str: str
    _max_repair_attempts = 1

    def __init__(self, model: TypeChatModel, validator: TypeChatValidator[T], target_type: type[T]):
        super().__init__()
        self.model = model
        self.target_type = target_type
        self.validator = validator
        conversion_result = python_type_to_typescript_schema(target_type)
        self._type_name = conversion_result.typescript_type_reference
        self._schema_str = conversion_result.typescript_schema_str

    async def translate(self, request: str) -> Result[T]:
        request = self._create_request_prompt(request)
        num_repairs_attempted = 0
        while True:
            completion_response = await self.model.complete(request)
            if isinstance(completion_response, Failure):
                return completion_response

            text_response = completion_response.value
            first_curly = text_response.find("{")
            last_curly = text_response.rfind("}") + 1
            error_message: str
            if 0 <= first_curly < last_curly:
                trimmed_response = text_response[first_curly:last_curly]
                result = self.validator.validate(trimmed_response)
                if isinstance(result, Success):
                    return result
                error_message = result.message
            else:
                error_message = "Response did not contain any text resembling JSON."
            if num_repairs_attempted >= self._max_repair_attempts:
                return Failure(error_message)
            num_repairs_attempted += 1
            request = f"{text_response}\n{self._create_repair_prompt(error_message)}"

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
