# Typechat
In this repo, we're exploring an approach to developer tools for generative ai prompt engineering.  In our experiences so far with building systems around LLMs, we have observed that:
1. LLMs can be constrained to avoid unexpected output formats if we specify the output form using a formal description such as a schema.
2. LLMs produce more consistent output if the prompt contains unambiguous, formal description of the possible outputs.
3. The approach of using formal schemas works best when the LLM has trained on many tokens from the given formal language.
4. For specifying schemas, formal schema languages such as JSON Schema are more verbose (4-5X) than programming languages like TypeScript 
5. Developers have requested a way to bridge between the approximate world of natural language chat and the precise world of software that takes actions on systems of record. Of course, the need for this bridge depends on the type of LLM application under development. For applications like search and draft generation, the system can remain in the approximate world because the human is in the loop selecting search results and reviewing draft edits.  For applications like updating a database, the bridge is an important step toward updating systems of record. 

This repo supplies one possible method for implementing one of two parts of a bridge: validating that the LLM output conforms to a schema that describes the instances that the system can work with.  Once the validity of an instance is established, the system using typechat must still verify that the valid instance corresponds to the end-user's actual intent. 

To support validation, the developer creates a schema using a TypeScript type declaration file (.d.ts). The developer selects a root type from the schema that corresponds to the JSON object output requested of the LLM.  The developer describes in natural language the meaning of the root type (for example, a set of calendar update actions) and also the overall framing of the application (for example, a person is working with a bot to update a calendar).  

The developer can combine these inputs with end-user input to create a prompt that will result in the LLM generating a JSON instance. The typechat library validates the JSON instance against the schema provided by the developer, simplifying the task of verifying that the captured end-user intent can be successfully processed by the system. 
## Build
`npm run build`

## Test
`npm run test`

## Environment Variables
Currently, the experiments are only running on Azure OpenAI endpoints.  To configure environment for this set the following variables:
| Variable | Value |
|----------|-------|
`OPENAI_API_KEY` | your API key
`OPENAI_API_BASE`| the base URL for your openai endpoint
`DEPLOYMENT_NAME`| the name of your Azure deployment

## Interactive Prompts
To run a test interactively, type `node [testName].js -i` and then enter a multi-line prompt. Enter a blank line to send the prompt 
and enter 'exit' on a line to end the session.

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
