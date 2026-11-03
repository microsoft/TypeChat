# TypeChat

TypeChat is a library that makes it easy to build natural language interfaces using types.

Building natural language interfaces has traditionally been difficult.
These apps often relied on complex decision trees to determine intent and collect the required inputs to take action.
Large language models (LLMs) have made this easier by enabling us to take natural language input from a user and match to intent.
This has introduced its own challenges, including the need to constrain the model's reply for safety,
structure responses from the model for further processing, and ensuring that the reply from the model is valid.
Prompt engineering aims to solve these problems, but comes with a steep learning curve and increased fragility as the prompt increases in size.

TypeChat replaces _prompt engineering_ with _schema engineering_.

Simply define types that represent the intents supported in your natural language application.
That could be as simple as an interface for categorizing sentiment or more complex examples like types for a shopping cart or music application.
For example, to add additional intents to a schema, a developer can add additional types into a discriminated union.
To make schemas hierarchical, a developer can use a "meta-schema" to choose one or more sub-schemas based on user input.

After defining your types, TypeChat takes care of the rest by:

1. Constructing a prompt to the LLM using types.
2. Validating the LLM response conforms to the schema. If the validation fails, repair the non-conforming output through further language model interaction.
3. Summarizing succinctly (without use of a LLM) the instance and confirm that it aligns with user intent.

Types are all you need!

## Getting Started

Install TypeChat:

```sh
pip install typechat
```

To use TypeChat in an existing backend without an interactive chat loop, follow the
[non-interactive Python quickstart](../site/src/docs/python/non-interactive.md).
It includes a [standalone sentiment example](./examples/sentiment/non_interactive.py) and an async function you can call from application code.

You can also develop TypeChat from source, which needs [Python >=3.11](https://www.python.org/downloads/),
[hatch](https://hatch.pypa.io/1.6/install/), and [Node.js >=24.22.1](https://nodejs.org/en/download):

```sh
git clone https://github.com/microsoft/TypeChat
cd TypeChat/python
hatch shell
npm ci
```

To see TypeChat in action, we recommend exploring the
[TypeChat example projects](https://github.com/microsoft/TypeChat/tree/main/python/examples).
You can try them on your local machine or in a GitHub Codespace.

To learn more about TypeChat, visit the
[documentation](https://microsoft.github.io/TypeChat/docs/python/basic-usage/)
which includes more information on TypeChat and how to get started.

## Documenting schema fields

Trailing Python comments on directly declared `TypedDict` and dataclass fields become
documentation in the generated TypeScript schema:

```python
from typing import Annotated
from typing_extensions import Doc, TypedDict

class Point(TypedDict):
    x: int  # X-coordinate
    y: Annotated[int, Doc("Y-coordinate")]  # Explicit documentation takes precedence.
```

Explicit `Annotated` documentation, supplied through `Doc` or a string, takes precedence
over an inline comment, including when that explicit documentation is empty.
Comments are recognized using Python's tokenizer, so `#` inside a string literal is not
treated as documentation. For multiline field declarations, put the comment on the final line.
`# type: ignore` directives, including those with bracketed error codes, are not treated
as field documentation.

Source inspection is read-only and supports nested class definitions with multiline strings.
If source is unavailable, such as for dynamically created types or deployments without source files,
conversion continues using the type annotations
and explicit documentation without inline comments. If available source cannot be parsed,
the problem is reported in `TypeScriptSchemaConversionResult.errors` rather than silently
discarding the comments.

## Accessing failed output

`Failure` retains its existing `message` and can also carry an unvalidated `value: object` and
`response_text: str | None`. Validators return the rejected input in `value`; translators also retain
the original model text, including when it is not valid JSON:

```python
from typechat import Failure

result = await translator.translate(request)
if isinstance(result, Failure):
    if result.has_value:
        rejected = result.value
        # Validate or repair this value before treating it as the target type.
    original_response = result.response_text
```

Check `has_value` before using `value`. It distinguishes unavailable data from a rejected `None`,
`False`, `0`, or empty string. An unavailable value is represented by an internal missing-value marker,
not `None`. Custom validators can supply their own payloads using
`Failure(message, value=rejected, response_text=text)`, and the translator preserves those payloads.
`Failure(message)` remains valid, and payload fields are omitted from its representation.
Use `isinstance` with `Success` or `Failure` to distinguish outcomes, not the presence of `value`.

On final failure, automatic repair retains the latest rejected candidate and available response text,
not a full attempt history. If a repair response cannot be parsed, `value` can come from an earlier
attempt than `response_text`. An initial network failure has no candidate value. Successful results,
error messages, and repair limits are unchanged, including Python's existing repair of malformed JSON.

Rejected values and response text may contain sensitive output. Do not log or serialize them blindly.

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
