---
layout: doc-page
title: Basic TypeScript Usage
---

TypeChat is currently a small library, so we can get a solid understanding just by understanding the following example:

```ts
import fs from "fs";
import path from "path";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { processRequests } from "typechat/interactive";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { SentimentResponse } from "./sentimentSchema";

// Create a model.
const model = createLanguageModel(process.env);

// Create a validator.
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<SentimentResponse>(schema, "SentimentResponse");

// Create a translator.
const translator = createJsonTranslator(model, validator);

// Process requests interactively or from the input file specified on the command line
processRequests("😀> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
```

Let's break it down step-by-step.

## Providing a Model

TypeChat can be used with any language model.
As long as you can construct an object with the following properties:

```ts
export interface TypeChatLanguageModel {
    /**
     * Optional property that specifies the maximum number of retry attempts (the default is 3).
     */
    retryMaxAttempts?: number;
    /**
     * Optional property that specifies the delay before retrying in milliseconds (the default is 1000ms).
     */
    retryPauseMs?: number;
    /**
     * Obtains a completion from the language model for the given prompt.
     * @param prompt The prompt string or role-tagged prompt sections.
     */
    complete(prompt: string | PromptSection[]): Promise<Result<string>>;
}
```

then you should be able to try TypeChat out with such a model.

The key thing here is that only `complete` is required.
`complete` takes a string or an array of prompt sections and eventually returns text wrapped in a
`Result` if all goes well.

For convenience, TypeChat provides two functions out of the box to connect to the OpenAI API and Azure's OpenAI Services.
You can call these directly.

```ts
export function createOpenAILanguageModel(
    apiKey: string | undefined, model: string, endPoint?: string,
    org?: string, options?: LanguageModelOptions
): TypeChatLanguageModel;

export function createAzureOpenAILanguageModel(
    apiKey: string | undefined, endPoint: string, options?: LanguageModelOptions
): TypeChatLanguageModel;
```

For even more convenience, TypeChat also provides a function to infer whether you're using OpenAI or Azure OpenAI.

```ts
export function createLanguageModel(env: Record<string, string | undefined>): TypeChatLanguageModel
```

With `createLanguageModel`, you can populate your environment variables and pass them in.
Based on whether `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` is set, you'll get a model of the appropriate type.

#### Using a bearer-token provider

Pass `undefined` for the API key and supply your existing synchronous or asynchronous
token provider in the options:

```ts
const model = createAzureOpenAILanguageModel(undefined, endpoint, {
    tokenProvider
});
```

`TokenProvider` is `() => string | Promise<string>`. Return the raw access-token string,
without a `Bearer ` prefix. The provider owns credential acquisition, caching, renewal,
and cleanup; TypeChat adds no Azure Identity dependency. It invokes the provider for each
HTTP attempt, including retries, and sends bearer authorization without an `api-key`
header. API keys and providers are mutually exclusive. Non-string/empty tokens or tokens
containing whitespace, control characters, or non-ASCII characters return an error before
dispatch. Provider exceptions follow the HTTP model's existing
retry/error policy.

Providers execute on the caller's JavaScript event loop. Synchronous providers should
return cached tokens quickly; use asynchronous SDK/network APIs for acquisition or renewal.
Adding `async` or calling `Promise.resolve` around synchronous I/O does not make that work
nonblocking. If a legacy provider requires blocking I/O, offload it using application-managed
workers (for example Node.js `worker_threads`) with an appropriate thread-safety and timeout
strategy. TypeChat invokes providers directly and does not automatically move them to workers.

The same option works with `createOpenAILanguageModel`, including its Responses mode:

```ts
const model = createOpenAILanguageModel(undefined, deployment, responsesEndpoint, "", {
    tokenProvider,
    useResponsesApi: true
});
```

The HTTP factories retain their proxy, timeout, response-size, and retry controls.
The HTTP request timeout does not bound credential acquisition inside your provider.
Existing string-key calls, environment handling, defaults, and legacy headers are unchanged;
`AZURE_OPENAI_API_KEY=identity` does not activate a provider.

#### Reusing a configured client

Adapt an existing OpenAI/AzureOpenAI SDK client, or a structurally compatible asynchronous
client, without importing an SDK into TypeChat:

```ts
const model = createOpenAILanguageModelFromClient(client, modelOrDeployment);
const responsesModel = createOpenAILanguageModelFromClient(client, modelOrDeployment, {
    useResponsesApi: true
});
```

Chat Completions is the default and calls `client.chat.completions.create`. Responses mode
is explicit and calls `client.responses.create`; a Chat-only client does not need a
`responses` property. TypeChat requests non-streaming output at temperature zero, with
`n=1` only for Chat Completions.

The adapter exposes only `complete`, retaining the supplied client's endpoint, API version,
authentication, retry/timeout settings, and ownership. It does not configure or close the
client or add another network-control layer. Configure proxies, timeouts, retries, and
response-size safeguards on that client, not on the adapter. Client exceptions and
cancellation propagate unchanged; missing/malformed output and filtered/refused content
return TypeChat errors.

String prompts and text/image user messages are supported. Bare strings in content arrays
become text parts; images retain URLs/data URLs and detail levels. Responses mode maps them
to `input_text`/`input_image` parts, defaulting omitted image detail to `"auto"`. System and
assistant messages support text only; unsupported content is reported rather than dropped.
Neither path fetches image references separately.

Pass either model to `createJsonTranslator` as usual. Schema validation, repair, and
reported response metadata/filtering behavior are preserved. SDK metadata covers the
resolved responses visible to TypeChat, not HTTP attempts hidden inside the client's retries.

#### Using OpenAI-compatible gateways

TypeChat works with any service that exposes the OpenAI Chat Completions API.
To use a gateway such as [OrcaRouter](https://www.orcarouter.ai) or OpenRouter,
point `createOpenAILanguageModel` at the gateway's endpoint via the `endPoint`
argument:

```ts
const model = createOpenAILanguageModel(apiKey, model, "https://api.orcarouter.ai/v1/chat/completions");
```

With `createLanguageModel`, set the `OPENAI_ENDPOINT` environment variable to
the gateway's Chat Completions URL alongside `OPENAI_API_KEY` and
`OPENAI_MODEL`:

```
OPENAI_API_KEY=<your API key>
OPENAI_MODEL=<model name>
OPENAI_ENDPOINT=https://api.orcarouter.ai/v1/chat/completions
```

Regardless, of how you decide to construct your model, it is important to avoid committing credentials directly in source.
One way to make this work between production and development environments is to use a `.env` file in development, and specify that `.env` in your `.gitignore`.
You can use a library like [`dotenv`](https://www.npmjs.com/package/dotenv) to help load these up.

```ts
import dotenv from "dotenv";
dotenv.config(/*...*/);

// ...

import * as typechat from "typechat";
const model = typechat.createLanguageModel(process.env);
```


## Defining and Loading the Schema

TypeChat describes types to language models to help guide their responses.
In this case, we are using a `TypeScriptJsonValidator` which uses the TypeScript compiler to validate data against a set of types.
That means that we'll be writing out the types of the data we expect to get back in a `.ts` file.
Here's what our schema file `sentimentSchema.ts` look like:

```ts
// The following is a schema definition for determining the sentiment of a some user input.

export interface SentimentResponse {
    sentiment: "negative" | "neutral" | "positive";  // The sentiment of the text
}
```

The validator type-checks against a minimal library rather than the full TypeScript standard library, since responses are always plain JSON.
Besides primitives, object types, arrays, and unions, schemas can use `ReadonlyArray`, `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `Exclude`, `Extract`, `NonNullable`, `ReturnType`, `Awaited`, `Uppercase`, `Lowercase`, `Capitalize`, and `Uncapitalize`.
Runtime types such as `Date`, `Map`, or `Set` aren't JSON values and aren't available; describe their JSON representation instead (for example, an ISO date `string`).

It also means we will need to manually load up an input `.ts` file verbatim.

```ts
// Load up the type from our schema.
import type { SentimentResponse } from "./sentimentSchema";

// Load up the schema file contents.
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
```

Note: this code assumes a CommonJS module. If you're using ECMAScript modules, you can use [`import.meta.url`](https://nodejs.org/docs/latest-v19.x/api/esm.html#importmetaurl) or via [`import.meta.dirname`](https://nodejs.org/docs/latest-v21.x/api/esm.html#importmetadirname) depending on the version of your runtime.

This introduces some complications to certain kinds of builds, since our input files need to be treated as local assets.
One way to achieve this is to use a runtime or tool like [`ts-node`](https://www.npmjs.com/package/ts-node) to both import the file for its types, as well as read the file contents.
Another is to use a utility like [`copyfiles`](https://www.npmjs.com/package/copyfiles) to move specific schema files to the output directory.
If you're using a bundler, there might be custom way to import a file as a raw string as well.
Regardless, [our examples](https://github.com/microsoft/TypeChat/tree/main/typescript/examples) should work with either of the first two options.

Alternatively, if we want, we can build our schema with objects entirely in memory using Zod and a `ZodValidator` which we'll touch on in a moment.
Here's what our schema would look like if we went down that path.

```ts
import { z } from "zod";

export const SentimentResponse = z.object({
    sentiment: z.enum(["negative", "neutral", "positive"]).describe("The sentiment of the text")
});

export const SentimentSchema = {
    SentimentResponse
};
```

## Creating a Validator

A validator really has two jobs generating a textual schema for language models, and making sure any data fits a given shape.
The interface looks roughly like this:

```ts
/**
 * An object that represents a TypeScript schema for JSON objects.
 */
export interface TypeChatJsonValidator<T extends object> {
    /**
     * Return a string containing TypeScript source code for the validation schema.
     */
    getSchemaText(): string;
    /**
     * Return the name of the JSON object target type in the schema.
     */
    getTypeName(): string;
    /**
     * Validates the given JSON object according to the associated TypeScript schema. Returns a
     * `Success<T>` object containing the JSON object if validation was successful. Otherwise, returns
     * an `Error` object with a `message` describing the error and, when available, rejected `data`.
     * @param jsonText The JSON object to validate.
     * @returns The JSON object or an error message.
     */
    validate(jsonObject: object): Result<T>;
}
```

In other words, this is just the text of all types, the name of the top-level type to respond with, and a validation function that returns a strongly-typed view of the input if it succeeds.

TypeChat ships with two validators.

### `TypeScriptJsonValidator`

A `TypeScriptJsonValidator` operates off of TypeScript text files.
To create one, we have to import `createTypeScriptJsonValidator` out of `typechat/ts`:

```ts
import { createTypeScriptJsonValidator } from "typechat/ts";
```

We'll also need to actually import the type from our schema.

```ts
import { SentimentResponse } from "./sentimentSchema";
```

With our schema text and this type, we have enough to create a validator:

```ts
const validator = createTypeScriptJsonValidator<SentimentResponse>(schema, "SentimentResponse");
```

We provided the text of the schema and the name of the type we want returned data to satisfy.
We also have to provide the type argument `SentimentResponse` to explain what data shape we expect (though note that this is a bit like a type cast and isn't guaranteed).

#### String enums

JSON represents a TypeScript string enum using the member's value, not its name. The TypeScript validator
normalizes string-enum types to their literal values before validating, including when they appear in nested
objects, arrays, unions, and index signatures.

```ts
export enum Currency {
    USD = "USD",
    EUR = "EUR"
}

export interface Order {
    currency: Currency;
}
```

The JSON `{ "currency": "EUR" }` is valid, while `{ "currency": "GBP" }` is not. If a member's name and value
differ, such as `Basic = "basic"`, JSON must use `"basic"`; `"Basic"` is rejected. Numeric enums keep their
existing numeric validation behavior.

Merged declarations contribute all their enum members. Qualified names such as `N.keyof` work
even when the enum name is also a contextual keyword.

String values are matched exactly by their UTF-16 code units. BOMs are not removed and Unicode
normalization is not applied. Use Unicode escape sequences for lone surrogates in schema source,
for example `"\uD800\uFEFFx"`. When constructing schema text in JavaScript, use `String.raw` or escaped
backslashes so the compiler receives these escapes rather than raw lone-surrogate characters.

Members initialized with compile-time string expressions, such as `Euro = "E" + "UR"`, are supported when
TypeScript resolves the value to a string literal. Computed members without a compile-time literal type should be
modeled with a string literal union instead.

### Zod Validators

If you chose to define your schema with Zod, you can use the `createZodJsonValidator` function:

```ts
import { createZodJsonValidator } from "typechat/zod";
```

Instead of a source file, a Zod validator needs a JavaScript object mapping from type names to Zod type objects like `myObj` in the following example:

```ts
export const MyType = z.object(/*...*/);

export const MyOtherType = z.object(/*...*/);

export let myObj = {
    MyType,
    MyOtherType,
}
```

From above, that was just `SentimentSchema`:

```ts
export const SentimentSchema = {
    SentimentResponse
};
```

So we'll need to import that object...

```ts
import { SentimentSchema } from "./sentimentSchema";
```

and provide it, along with our expected type name, to `createZodJsonValidator`:

```ts
const validator = createZodJsonValidator(SentimentSchema, "SentimentResponse");
```

## Creating a JSON Translator

A `TypeChatJsonTranslator` brings these together.

```ts
import { createJsonTranslator } from "typechat";
```

A translator takes both a model and a validator, and provides a way to translate some user input into objects following our schema.
To do so, it crafts a prompt based on the schema, reaches out to the model, parses out JSON data, and attempts validation.
Optionally, it will craft one repair prompt and retry if the response has no JSON object, the JSON cannot be parsed, or validation fails.

```ts
const translator = createJsonTranslator(model, validator);
```

When we are ready to translate a user request, we can call the `translate` method.

```ts
translator.translate("Hello world! 🙂");
```

### Message layout in 0.3

By default the translator sends:

1. A **system** message with the application's instructions, the validator's schema and target type, and the JSON output rules.
2. Any **caller-supplied context**, in its original order and roles. A string preamble becomes one user message.
3. One **user** message containing the current request exactly as passed to `translate`, without quoting or other wrappers.

TypeChat does not store conversation history. For a follow-up, pass prior turns as the second argument, **not** as part of the new request:

```ts
await translator.translate("What about this one? Great!", [
    { role: "user", content: "I disliked it." },
    { role: "assistant", content: '{"sentiment":"negative"}' }
]);
```

For multimodal context, a user section's `content` can be an array of text and image parts.
The [crossword example](https://github.com/microsoft/TypeChat/tree/main/typescript/examples/crossword/src/translator.ts)
passes a screenshot that way, leaving the final user question untouched.

To add application-owned instructions, extend the system builder. It receives **no request or history**:

```ts
const schemaPrompt = translator.createSystemPrompt;
translator.createSystemPrompt = () => `${schemaPrompt()}\nClassify the sentiment of the most recent user message.`;
```

Keep user text, retrieved content, and model replies out of this builder; assign a caller preamble the system role **only** for your own trusted instructions.
Role separation does not establish intent or authorize an action. Continue validating data and applying application permissions.

`createProgramTranslator(model, apiSchema)` from `typechat/ts` uses the same message order but a different output contract:
it asks for a JSON **Program** with `@steps`, provides the Program definitions **and** the allowed `API`, and checks calls against that API.

### Migrating a 0.2 request hook or model

If you need the previous layout, select it when constructing the translator. This preserves the combined schema/request **user** prompt
and the `createRequestPrompt(request)` hook, including hooks that return structured content:

```ts
const legacy = createJsonTranslator(model, validator, { promptLayout: "legacy" });
// If your app overrode this hook in 0.2, the same function can still be used.
legacy.createRequestPrompt = myExistingRequestPrompt;
```

`createProgramTranslator` accepts the same option. In the default layout an override of `createRequestPrompt` returns a migration error from `translate` before a model call;
TypeChat neither ignores the override nor calls it to build a system message. To migrate, move just the trusted instructions into `createSystemPrompt()` and pass the context as a preamble.

A custom model must forward the roles and structured content it receives or report that it cannot. Do not concatenate history into a single prompt.
There is no automatic fallback to legacy. Even in legacy layout a preamble or a repair can require multiple roles.

In either layout, missing JSON, JSON that cannot be parsed, or a parsed object that fails validation can trigger **one** repair: TypeChat appends the original model text as **assistant**
and `createRepairPrompt(diagnostic)` as **user**. Set `attemptRepair = false` to turn that off.
The model's transport retry settings are separate.

## Creating the Prompt

TypeChat exports a `processRequests` function that makes it easy to experiment with TypeChat.
We need to import it from `typechat/interactive`.

```ts
import { processRequests } from "typechat/interactive";
```

It either creates an interactive command line prompt, or reads lines in from a file.

```ts
typechat.processRequests("😀> ", process.argv[2], async (request) => {
    // ...
});
```

`processRequests` takes 3 things.
First, there's the prompt prefix - this is what a user will see before their own text in interactive scenarios.
You can make this playful.
We like to use emoji here. 😄

Next, we take a text file name.
Input strings will be read from this file on a per-line basis.
If the file name was `undefined`, `processRequests` will work on standard input and provide an interactive prompt.
Using `process.argv[2]` makes our program interactive by default unless the person running the program provided an input file as a command line argument (e.g. `node ./dist/main.js inputFile.txt`).

Finally, there's the request handler.
We'll fill that in next.

## Translating Requests

Our handler receives some user input (the `request` string) each time it's called.
It's time to pass that string into over to our `translator` object.

```ts
typechat.processRequests("😀> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
```

We're calling the `translate` method on each string and getting a response.
If something goes wrong, TypeChat will retry requests up to a maximum specified by `retryMaxAttempts` on our `model`.
However, if the initial request as well as all retries fail, `response.success` will be `false` and we'll be able to grab a `message` explaining what went wrong.

In the ideal case, `response.success` will be `true` and we'll be able to access our well-typed `data` property!

## Accessing Failed Output

A failed response may also provide `data: unknown` and `responseText: string`.
The data is the rejected value, not a validated `SentimentResponse`.
The response text is the original model output, including when it cannot be parsed as JSON.

```ts
const response = await translator.translate(request);
if (!response.success) {
    const originalResponse = response.responseText;
    if ("data" in response) {
        const rejected: unknown = response.data;
        // Validate or repair this value before using it as a SentimentResponse.
    }
}
```

Use `success` to distinguish outcomes, not the presence of `data`.
TypeScript and Zod validators also retain rejected inputs when used directly.
Custom validators can return `error(message, { data, responseText })`, and the translator preserves
their payloads. To manage validation repairs yourself, set `translator.attemptRepair = false`.

If automatic repair fails, TypeChat retains the latest rejected candidate and available model text,
not a full attempt history. These can refer to different attempts if the repair response could not
be parsed. A network failure before any output has no candidate data.
Rejected values and response text may contain sensitive output; do not log them automatically.
This will correspond to the type that we passed in when we created our translator object (i.e. `SentimentResponse`).

That's it!
You should now have a basic idea of TypeChat's APIs and how to get started with a new project. 🎉
