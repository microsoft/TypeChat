from typing_extensions import Protocol, override
import os
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

def create_language_model(vals: dict[str,str|None]) -> TypeChatModel:
    model:TypeChatModel
    client: openai.AsyncOpenAI | openai.AsyncAzureOpenAI
    
    if "OPENAI_API_KEY" in vals:
        client = openai.AsyncOpenAI(api_key=vals["OPENAI_API_KEY"])
        model = DefaultOpenAIModel(model_name=vals.get("OPENAI_MODEL", None) or "gpt-35-turbo", client=client)

    elif "AZURE_OPENAI_API_KEY" in vals and "AZURE_OPENAI_ENDPOINT" in vals:
        os.environ["OPENAI_API_TYPE"] = "azure"
        client=openai.AsyncAzureOpenAI(azure_endpoint=vals.get("AZURE_OPENAI_ENDPOINT",None) or "", api_key=vals["AZURE_OPENAI_API_KEY"],api_version="2023-03-15-preview")
        model = DefaultOpenAIModel(model_name=vals.get("AZURE_OPENAI_MODEL", None) or "gpt-35-turbo", client=client)
    
    else:
        raise ValueError("Missing environment variables for Open AI or Azure OpenAI model")
        
    return model