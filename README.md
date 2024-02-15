# TypeChat

TypeChat is a library that makes it easy to build natural language interfaces using types.

Building natural language interfaces has traditionally been difficult. These apps often relied on complex decision trees to determine intent and collect the required inputs to take action. Large language models (LLMs) have made this easier by enabling us to take natural language input from a user and match to intent. This has introduced its own challenges including the need to constrain the model's reply for safety, structure responses from the model for further processing, and ensuring that the reply from the model is valid. Prompt engineering aims to solve these problems, but comes with a steep learning curve and increased fragility as the prompt increases in size.

TypeChat replaces _prompt engineering_ with _schema engineering_.

Simply define types that represent the intents supported in your natural language application. That could be as simple as an interface for categorizing sentiment or more complex examples like types for a shopping cart or music application. For example, to add additional intents to a schema, a developer can add additional types into a discriminated union. To make schemas hierarchical, a developer can use a "meta-schema" to choose one or more sub-schemas based on user input.

After defining your types, TypeChat takes care of the rest by:

1. Constructing a prompt to the LLM using types.
2. Validating the LLM response conforms to the schema. If the validation fails, repair the non-conforming output through further language model interaction.
3. Summarizing succinctly (without use of a LLM) the instance and confirm that it aligns with user intent.

Types are all you need!

# Getting Started

Install TypeChat:

```
npm install typechat
```

You can also build TypeChat from source:

```
git clone https://github.com/microsoft/TypeChat
cd TypeChat
npm run build
```
There are two main ways to get started with TypeChat:

1.Using Interfaces:

The traditional approach to building natural language interfaces is to use interfaces. Interfaces define the expected inputs and outputs of your application's functions. TypeChat can automatically generate prompts for large language models (LLMs) based on your interfaces, and then validate the LLM's responses to ensure they conform to the interface. This can help to make your applications more robust and reliable.

Here's an example of how to use an interface with TypeChat:

```
from typechat import Schema, Union

class Sentiment(Schema):
    text: str
    sentiment: Union["Positive", "Negative", "Neutral"]

class Positive(Schema):
    pass

class Negative(Schema):
    pass

class Neutral(Schema):
    pass

# Use the Sentiment schema to generate a prompt for the LLM
prompt = typechat.generate_prompt(Sentiment)

# Get the LLM's response
response = llm.query(prompt)

# Validate the response against the Sentiment schema
validated_response = typechat.validate(response, Sentiment)

# Use the validated response in your application
if validated_response.sentiment == "Positive":
    print("The user's sentiment is positive!")
else:
    print("The user's sentiment is not positive.")

```

2.Using Types:

TypeChat can also be used with types, which are simpler than interfaces but can still be used to define the expected inputs and outputs of your application's functions. Types can be used to specify the data types of the inputs and outputs, as well as any constraints that they must meet.

Here's an example of how to use types with TypeChat:
```
from typechat import Schema, String, Int

class Sentiment(Schema):
    text: String
    sentiment: str

# Use the Sentiment schema to generate a prompt for the LLM
prompt = typechat.generate_prompt(Sentiment)

# Get the LLM's response
response = llm.query(prompt)

# Validate the response against the Sentiment schema
validated_response = typechat.validate(response, Sentiment)

# Use the validated response in your application
if validated_response.sentiment == "positive":
    print("The user's sentiment is positive!")
else:
    print("The user's sentiment is not positive.")

```

## TypeChat -JsonTranslator

This TypeScript module provides a way to translate natural language requests into JSON objects of a specified type, using a language model and schema validation.

Key Features:

- Schema-based validation
- Repair attempts
- Customizable prompts
- Additional validation

## TypeChat -LanguageModel

The TypeChatLanguageModel provides a valuable abstraction layer for developers working with OpenAI and Azure OpenAI language models. Its strengths lie in its simplicity, flexibility, and reliability, making it a compelling choice for building applications that leverage natural language processing capabilities.

Key Features:

- Abstract Interface: It defines a clear contract for interacting with language models, making it adaptable to different providers and implementations.
- API Abstraction: It encapsulates communication with language model APIs, handling requests, responses, and potential errors.
- Environment-Based Configuration: It seamlessly supports OpenAI or Azure OpenAI models, with configuration driven by environment variables.
- Retry Logic: It incorporates automatic retries for transient errors, enhancing reliability and robustness.
- Customizable Prompt Handling: It supports both simple string prompts and more complex prompt sections with designated roles, enabling tailored interactions.
- Asynchronous Operations: It utilizes Promises for asynchronous completion requests, promoting non-blocking code and efficient execution.

  
To see TypeChat in action, we recommend exploring the [TypeChat example projects](./examples). You can try them on your local machine or in a GitHub Codespace.

To learn more about TypeChat, visit the [documentation](https://microsoft.github.io/TypeChat) which includes more information on TypeChat and how to get started.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
