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

Requires [Node.js 24.22.1 or newer](https://nodejs.org/en/download).
The development version is pinned in [.nvmrc](../.nvmrc).

Install TypeChat:

```sh
npm install typechat
```

TypeChat supports both native ECMAScript modules (ESM) and CommonJS. Use `import`
in an ESM application:

```js
import { createJsonTranslator } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
```

Or use `require` in a CommonJS application:

```js
const { createJsonTranslator } = require("typechat");
const { createTypeScriptJsonValidator } = require("typechat/ts");
```

The `typechat`, `typechat/ts`, `typechat/zod`, and `typechat/interactive` entry points
select the matching JavaScript build and TypeScript declarations automatically.
Both builds target ES2021 and require Node.js 24.22.1 or newer.

For compatibility with earlier CommonJS-only releases, native ESM default imports
(`import typechat from "typechat"`) and dynamic imports' `.default` properties remain
supported for all four entry points. Default imports also preserve the exported
TypeScript types, such as `typechat.Result<T>`.

You can also build TypeChat from source:

```sh
git clone https://github.com/microsoft/TypeChat
cd TypeChat/typescript
npm install
npm run build
```

The build emits CommonJS JavaScript and declarations in `dist`, and native ESM
JavaScript and declarations in `dist/esm`.

Run the test suite with `npm test`. Package tests verify named and default imports,
both module formats, and their declaration resolution using only the files included
in the npm package.
The test command recursively discovers compiled `*.test.js` suites under `out/`
and runtime `*.test.mjs` suites under `tests/`. Add TypeScript tests under
[test/](https://github.com/microsoft/TypeChat/tree/main/typescript/test) or runtime
tests under [tests/](https://github.com/microsoft/TypeChat/tree/main/typescript/tests);
no manual suite-list update is needed.
Quoted patterns let Node handle discovery consistently across platforms, including
nested directories, without executing helper files or uncompiled TypeScript.

The Zod schema tests also compile their generated TypeScript schema text to check
for syntax errors and unresolved type references.
Node.js CI runs this suite across its Node.js matrix after a clean dependency
installation and workspace build.

The TypeScript-backed JSON validator checks its schema and target export before a
translator makes its first model request. Schema configuration errors are returned
without asking the model to repair them. This preflight uses the same minimal
TypeScript library as response validation and is cached for the validator's lifetime.
Once a schema passes preflight, invalid model responses continue through the normal
validation and repair flow. Zod and custom validators without schema-only checks keep
their existing instance-validation behavior. The `TypeChatJsonValidator` contract is
unchanged; custom validators can opt in through the exported `typeChatSchemaValidation`
symbol, so existing string-named `validateSchema` methods are not invoked as preflight.

To see TypeChat in action, we recommend exploring the [TypeChat example projects](https://github.com/microsoft/TypeChat/tree/main/typescript/examples). You can try them on your local machine or in a GitHub Codespace.

To learn more about TypeChat, visit the [documentation](https://microsoft.github.io/TypeChat) which includes more information on TypeChat and how to get started.

## Accessing failed output

Failed results include a `message` and may also include `data: unknown` and `responseText: string`.
Validators return the rejected input in `data`. Translators also retain the original model text,
including when that text is not valid JSON:

```ts
const result = await translator.translate(request);
if (!result.success) {
    const rejected: unknown = result.data;
    const originalResponse = result.responseText;
    // Validate or repair the rejected value before treating it as the target type.
}
```

On final failure, automatic repair retains the latest rejected candidate and available response text,
not a full attempt history. If a repair response cannot be parsed, `data` can come from an earlier
attempt than `responseText`. An initial network failure has no candidate data. Successful results,
error messages, and repair limits are unchanged; `getData` still throws on failure.

Use `success` to distinguish successful and failed results, not the presence of `data`.
Custom validators can supply their own failure payloads, which the translator preserves.
To create such a failure, use `error(message, { data, responseText })`; `error(message)` still returns
the original message-only shape. A present `data` property can contain any value, including `null`
or `undefined`, so check property presence when that distinction matters.

Rejected values and response text may contain sensitive output. Do not log them automatically.

## Accessing response metadata

Model and translation results can include optional `metadata` on success and failure,
separate from application data. See the [response metadata guide](https://github.com/microsoft/TypeChat/blob/main/typescript/metadata.md)
for reported token usage, initial and repair response records, and available filtering details.
The guide is also included as `metadata.md` in the npm package.

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
