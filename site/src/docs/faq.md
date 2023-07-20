---
layout: doc-page
title: Frequently Asked Questions (FAQ)
---

### What is TypeChat?

TypeChat makes it easy to build natural language interfaces using types. These types represent your application's domain, such as an interface for representing user sentiment or types for actions a user could take in a music app.

After defining your types, TypeChat takes care of the rest by:

1. Constructing a prompt to the LLM using types.
2. Validating the LLM response conforms to the schema. If the validation fails, repair the non-conforming output through further language model interaction.
3. Summarizing succinctly (without use of a LLM) the instance and confirm that it aligns with user intent.

Types are all you need!

### Why is TypeChat useful?

If you want to add a natural language interface to an app – for example, let’s assume a coffee ordering app that let’s you speak out your order – then you eventually need to translate a request into something precise and concrete that your app can process for tasks like billing, ordering, etc. 

TypeChat lets you push on large language models to do this work without having to worry about how to parse out its response or dealing with “imaginary” items and tasks. This is because everything must be structured JSON that is validated against your types. 

### What are the benefits of using TypeChat?

TypeChat was created with the purpose of increasing safety in natural language interfaces. 

We believe TypeChat has three key primary benefits when working with large language models:

1. Accurate: Large language models do a great job matching user intent to scoped types. TypeChat's validation and repair cleans up the rest!
2. Approachable: No more prompt engineering! Types are all you need. You probably have them already lying around.
3. Safety: Types constrain domain and model uncertainty. Repeating back the instance confirms that it aligns with user intent before taking action.

### How does TypeChat work? How does TypeChat relate to TypeScript?

TypeChat uses TypeScript types as the “specification language” for responses from language models. The approach for sending a request is minimal that includes the user's inputs, your types, and text requesting the model to translate the user input into a JSON object in alignment with the TypeScript types.

Once receiving an AI response, TypeChat uses the TypeScript compiler API under the hood to validate the data based on the types you provided. If validation fails, TypeChat sends a repair prompt back to the model that includes diagnostics from the TypeScript compiler. That’s how TypeChat can guarantee that your response is correctly typed.

### How reliable is TypeChat?

TypeChat is _very_ reliable. Large language models have proven they do well when constrained with umambiguous, formal descriptions of possible outputs. They also perform better the more training they have received. TypeScript is the type system for the world's most popular programming language, and JSON is the interchange format for the most popular programming language. As a result, the model has extreme familiarity with both, increasing accuracy. TypeChat purposely creates the prompt compact, and TypeScript can be as much as 5x more concise than a JSON equivalent. Most of the time, the model responds well to the prompt from TypeChat, and sends back a valid instance. TypeChat adds validation, and (if that fails) self-reparing logic to obtain a valid response from the model using diagnostics from the TypeScript compiler. Finally, TypeChat keeps the user in the loop for final confirmation of intent, serving as a final safety mechanism.

### What languages does TypeChat support?

Currently TypeChat is being developed just for TypeScript and JavaScript. Developers interested in support for additional languages can engage in discussion on TypeChat's repo in GitHub Discussions.