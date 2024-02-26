from typing_extensions import Protocol, override
import openai

from typechat._internal.result import Failure, Result, Success


class TypeChatLanguageModel(Protocol):
    async def complete(self, input: str) -> Result[str]:
        """
        Represents a AI language model that can complete prompts.
        
        TypeChat uses an implementation of this protocol to communicate
        with an AI service that can translate natural language requests to JSON
        instances according to a provided schema.
        The `create_language_model` function can create an instance.
        """
        ...


class DefaultOpenAIModel(TypeChatLanguageModel):
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

def create_language_model(vals: dict[str, str | None]) -> TypeChatLanguageModel:
    """
    Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
    chosen by a dictionary of variables (typically just `os.environ`).

    If an `OPENAI_API_KEY` environment variable exists, an OpenAI model is constructed.
    The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables must also be defined or an error will be raised.

    If an `AZURE_OPENAI_API_KEY` environment variable exists, an Azure OpenAI model is constructed.
    The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined or an exception will be thrown.

    If none of these key variables are defined, an exception is thrown.
    @returns An instance of `TypeChatLanguageModel`.

    Args:
        vals: A dictionary of variables. Typically just `os.environ`.
    """
    model: TypeChatLanguageModel
    client: openai.AsyncOpenAI | openai.AsyncAzureOpenAI

    def required_var(name: str) -> str:
        val = vals.get(name, None)
        if val is None:
            raise ValueError(f"Missing environment variable {name}.")
        return val

    if "OPENAI_API_KEY" in vals:
        client = openai.AsyncOpenAI(api_key=required_var("OPENAI_API_KEY"))
        model = DefaultOpenAIModel(model_name=required_var("OPENAI_MODEL"), client=client)

    elif "AZURE_OPENAI_API_KEY" in vals:
        openai.api_type = "azure"
        client = openai.AsyncAzureOpenAI(
            api_key=required_var("AZURE_OPENAI_API_KEY"),
            azure_endpoint=required_var("AZURE_OPENAI_ENDPOINT"),
            api_version="2023-03-15-preview",
        )
        model = DefaultOpenAIModel(model_name=vals.get("AZURE_OPENAI_MODEL", None) or "gpt-35-turbo", client=client)

    else:
        raise ValueError("Missing environment variables for OPENAI_API_KEY or AZURE_OPENAI_API_KEY.")

    return model
