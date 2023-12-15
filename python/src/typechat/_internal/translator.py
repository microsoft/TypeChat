from textwrap import dedent, indent
from typing import Generic, TypeVar

from typechat._internal.model import TypeChatModel
from typechat._internal.result import Failure, Result, Success
from typechat._internal.validator import TypeChatValidator
from typechat.py2ts import pyd_to_ts
from typechat.ts2str import ts_declaration_to_str

T = TypeVar("T", covariant=True)

class TypeChatTranslator(Generic[T]):
    model: TypeChatModel
    validator: TypeChatValidator[T]
    target_type: type[T]
    _type_name: str
    _declaration_str: str
    _max_repair_attempts = 1

    def __init__(self, model: TypeChatModel, validator: TypeChatValidator[T], target_type: type[T]):
        super().__init__()
        self.model = model
        self.target_type = target_type
        self.validator = validator
        self._type_name = target_type.__name__  # TODO: https://github.com/microsoft/TypeChat.py/issues/4
        self._declaration_str = "\n".join(
            ts_declaration_to_str(decl) for decl in pyd_to_ts(target_type).type_declarations
        )

    def translate(self, request: str) -> Result[T]:
        request = self._create_request_prompt(request)
        num_repairs_attempted = 0
        while True:
            completion_response = self.model.complete(request)
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
        decl_str = indent(self._declaration_str, "            ")
        prompt = F"""
            You are a service that translates user requests into JSON objects of type "{self._type_name}" according to the following TypeScript definitions:
            ```
            {decl_str}
            ```
            The following is a user request:
            '''
            {intent}
            '''
            The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
            """
        prompt = dedent(prompt)
        return prompt

    def _create_repair_prompt(self, validation_error: str) -> str:
        validation_error = indent(validation_error, "            ")
        prompt = F"""
            The above JSON object is invalid for the following reason:
            '''
            {validation_error}
            '''
            The following is a revised JSON object:
            """
        return dedent(prompt)
