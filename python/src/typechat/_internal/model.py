from typing import Protocol, override

import openai

from typechat._internal.result import Failure, Result, Success


class TypeChatModel(Protocol):
    async def complete(self, input: str) -> Result[str]:
        ...


class DefaultOpenAIModel(TypeChatModel):
    model_name: str
    client: openai.AsyncOpenAI | openai.AsyncAzureOpenAI

    def __init__(self, model_name: str, client: openai.AsyncOpenAI | openai.AsyncAzureOpenAI):
        super().__init__()
        self.model_name = model_name
        self.client = client

    @override
    async def complete(self, input: str) -> Result[str]:
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": input}],
                temperature=0.0,
            )
            content = response.choices[0].message.content
            if content is None:
                return Failure("Response did not contain any text.")
            return Success(content)
        except Exception as e:
            return Failure(str(e))
