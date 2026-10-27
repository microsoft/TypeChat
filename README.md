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

The TypeScript/JavaScript package requires [Node.js 24.22.1 or newer](https://nodejs.org/en/download).
Development uses Node.js 24.22.1, pinned in [.nvmrc](./.nvmrc), which includes the
[October 21, 2026 security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

Install TypeChat for TypeScript/JavaScript:

```
npm install typechat
```

<!--

Or from PyPI:

...

Or NuGet

...

-->

You can also work with TypeChat from source for:

* [Python](./python/README.md)
* [TypeScript](./typescript/README.md)
* [C#/.NET](https://github.com/microsoft/TypeChat.net)

To see TypeChat in action, we recommend exploring the [TypeChat example projects](./typescript/examples). You can try them on your local machine or in a GitHub Codespace.

To learn more about TypeChat, visit the [documentation](https://microsoft.github.io/TypeChat) which includes more information on TypeChat and how to get started.

## Repository automation experiment

We are experimenting with a gradual transition to a semi-automated repository.
The initial agent-assisted workflow
keeps humans in the loop, while our longer-term goal is to help community
proposals progress from discussion to accepted, reviewed changes with less
manual coordination. Read about the [automation experiment](./AUTOMATION.md)
and how to participate.

**Status as of 2026-10-26:** The first read-only pilot is implemented and locally
validated, but its GitHub rollout and first live run are still pending.

| Milestone | Implemented | Current status |
| --- | --- | --- |
| Community-facing automation plan | 2026-10-26 | Documented in [AUTOMATION.md](./AUTOMATION.md). |
| Manual backlog assessment, Copilot guidance, and workflow checks | 2026-10-26 | Implemented; 16 local tests passed. Awaiting maintainer review, merge, and first GitHub run. |
| Assessment model and reasoning effort | 2026-10-26 | Pinned to GPT-6.1-sol with `max` effort for the main assessment only. Live model access still needs verification. |
| Automatic Copilot PR reviews and human approval gates | Not yet | Next rollout step; live repository settings still need verification. |
| GitHub-native discussion, acceptance, and agent implementation | Not yet | Planned, with human approval initially. |
| Selective automatic adoption of community proposals | Not yet | Future work, subject to public criteria and maintainer approval. |

Implementation dates do not mean a feature is enabled on GitHub. Existing
maintenance and deployment workflows are unchanged. See the
[detailed status](./AUTOMATION.md#status-and-implementation-history) and
[workflow model configuration](./AUTOMATION.md#model-selection).

## Contributing

**Repository automation experiment:** We are experimenting with a gradual
transition to a semi-automated repository. The initial agent-assisted workflow
keeps humans in the loop, while our longer-term goal is to help community
proposals progress from discussion to accepted, reviewed changes with less
manual coordination. Read about the [automation experiment](./AUTOMATION.md)
and how to participate.

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
