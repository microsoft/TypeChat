# Approach
TypeChat was created by Anders Hejlsberg (TypeScript, C#, Turbo Pascal, Delphi) and Steve Lucco (TypeScript, Visual Studio Code, Chakra, Fluid Framework) based on their experience crafting prompts for large language models. 

## Inspiration

So far, we have observed:

1. **Prompts**: LLMs can be constrained to avoid unexpected outoupt formats if we specify the output form using a formal description such as a schema. LLMs produce more consistent output if the prompt contains unambiguous, formal description of the possible outputs.
2. **Training**: The approach of formal schemas works best when the LLM has been trained on many tokens from the given language, such as TypeScript. Schema languages such as JSON schemas are generally more verbose than programming languages like TypeScript or simple schema languages like YAML schema.
3. **Scenarios**: Developers have requested a way to bridge the approximate world of natural language with the precise world of software that takes actions on systems of record. The need for this bridge depends on the application scenario. Search and draft generation can remain in the apporximate world because the human is in the loop selecting search results and reviewing draft edits. For applications that interact with business logic via an API or update a database, the use of schema increases the reliability and simplifies processing of user input.
4. **Schemas**: Many developers already have an informal or formal schema describing a program they'd like to work with a chat output, such as a database or API.

These observations - both from our own experience and working with other developers working with large language models - led us to create TypeChat.

## How TypeChat Works
There are three key ideas in TypeChat:

1. *Types*: Simplify define your intelligent application's domain using TypeScript types.
2. *Structured Prompt Templates & Responses*: TypeChat constructs a prompt to the large language model that includes the natural language user input and your defined TypeScript types. The large language model converts the TypeScript type to JSON schema, maps user input to that JSON schema, and returns a reply to the prompt using JSON.
3. *Response Validation*: To ensure the JSON response from the large language model is valid, TypeChat converts the JSON back to TypeScript types and runs an in-memory instance of the TypeScript compiler to validate the large language model's response. If the validation fails, TypeChat sends a self-repairing prompt back to the large language model.
