# TypeChat
TypeChat is a design pattern and a library for creating natural language (NL) interfaces. We originally developed TypeChat to increase the safety of NL interfaces for applications that make permanent changes. TypeChat increases safety by incorporating the following steps into each interaction with a language model:

1. Constrain language model output using a formal schema over the possible user requests.
2. Validate that model output conforms to the schema.  Repair non-conforming output through further language model interaction.
3. Once outut is a valid schema instance, succinctly summarize (without use of language model) the instance and confirm that it aligns with user intent.

Having followed these three steps, an application can make permanent changes knowing that intent is both confirmed and valid for processing. 

In addition to its safety benefit, we have found in practice that TypeChat also helps with the reliability and accuracy of NL interfaces.  This happens because TypeChat replaces "prompt engineering" with "schema engineering" and arbitrary text output with a formal representation.  These changes enable compositional properties not readily available with prompt engineering approaches that accrete into a prompt islands of NL text that may have varying goals.  

For example, to add additional intents to a schema, a developer can add the additional intents using type composition, such as adding additional types into a discriminated union.  To make schemas hierarchicial, a developer can use a "meta-schema" to choose one or more sub-schemas based on user input.

This repo uses TypeScript as the schema language. This choice works well in practice because

1. TypeScript is a common training input for large language models.
2. We can use the TypeScript compiler to validate JSON output and to provide high-quality diagnostic messages for JSON repair.
3. TypeScript is concise: about 5X smaller than JSON Schema for a typical user intent schema.

## Structure
The repo consists of the TypeChat library and a set of examples that use the library.  Each example has a different purpose.

- _CoffeeShop_:  A basic example illustrating how to capture user intent as a set of nouns, in this case the items in a coffee order.
- _Restaurant_:  Another set of nouns example but with more complex linguistic input, illustrating the line between simpler and more advanced language models in handling compound sentences, distrations and corrections. This example also shows how we can use TypeScript typing to simplify the creation of a user intent summary.
- _Calendar_:  A basic example that shows how to capture user intent as a sequence of actions.
- _Music_:  A more involved example of capturing intent as actions, this time using a JSON output form that corresponds to a simple dataflow program over a set of actions.

## Alternative 1: Use GitHub CodeSpaces
In your web browser, navigate to the [repo on GitHub](https://github.com/microsoft/typechat/). Click the green button, labelled `<> Code` and then choose the `Codespaces` tab.
Then click the green `Create codespaces` button.

![Create codespaces](docs/codespaces.png)

If this is your first time creating a codespace on this repo, 
GitHub will take a moment to create a dev container image for your session.

![Setting up your codespace](docs/setting-up-your-codespace.png)

Once the image has been created, the browser will load a version
of VSCode, which has been configured to communicate with your dev container in the cloud.

Note that the dev container is pre-configured to clone the repo and run `npm run install` so you are ready to go as soon as VS Code appears in your browser.

Remember that you are running in the cloud, so all changes you make to the source tree must be committed and pushed before destroying the CodeSpace. GitHub accounts are usually configured to automatically delete CodeSpaces that have been inactive for 30 days.

For more information, see the [GitHub Codespaces Overview](https://docs.github.com/en/codespaces/overview)

## Alternative 2: Configure your Dev Machine
1. Install [Node.js (18.16.0 LTS or newer)](https://nodejs.org/en). Note that this version of node comes with `npm` package manager.
2. Clone the repo with `git clone https://github.com/microsoft/typechat.git`.
3. `cd` to the root of the repo.
4. Install packages with `npm install`.

## Build
```     
npm run build
```
This will build the library module and the apps.

## Environment Variables
Currently, the experiments are running on OpenAI or Azure OpenAI endpoints. To use an OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `OPENAI_MODEL`| The OpenAI model name (e.g. gpt-3.5-turbo or gpt-4) |
| `OPENAI_API_KEY` | Your OpenAI API key |

To use an Azure OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `AZURE_OPENAI_ENDPOINT` | The full URL of the Azure OpenAI REST API (e.g. https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME/chat/completions?api-version=2023-05-15) |
| `AZURE_OPENAI_API_KEY` | Your Azure API key |

Environment variables can optionally be set by creating a `.env` file in the root directory of the project.

## Running the examples
The examples are found in `src/samples` and are built into `build/examples`. To run an example interactively, type `node <example-name>` in the example's build directory and enter requests when prompted. Type 'quit' or 'exit' to end the session. To run an example with an input file, type `node <example-name> <input-filename>`.

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
