---
layout: doc-page
title: Basic TypeScript Usage
---

TypeChat is currently a small library, so let's take a look at some basic usage to understand it.

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
     * @param prompt The prompt string.
     */
    complete(prompt: string): Promise<Result<string>>;
}
```

then you should be able to try TypeChat out with such a model.

The key thing here is that only `complete` is required.
`complete` is just a function that takes a `string` and eventually returns a `string` if all goes well.

For convenience, TypeChat provides two functions out of the box to connect to the OpenAI API and Azure's OpenAI Services.
You can call these directly.

```ts
export function createOpenAILanguageModel(apiKey: string, model: string, endPoint? string): TypeChatLanguageModel;

export function createAzureOpenAILanguageModel(apiKey: string, endPoint: string): TypeChatLanguageModel;
```

For even more convenience, TypeChat also provides a function to infer whether you're using OpenAI or Azure OpenAI.

```ts
export function createLanguageModel(env: Record<string, string | undefined>): TypeChatLanguageModel
```

You can populate your environment variables, and based on whether `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` is set, you'll get a model of the appropriate type.

```ts
import dotenv from "dotenv";
dotenv.config(/*...*/);
import * as typechat from "typechat";
const model = typechat.createLanguageModel(process.env);
```

Regardless, of how you decide to construct your model, we recommend keeping your secret tokens/API keys in a `.env` file, and specifying `.env` in a `.gitignore`.
You can use a library like [`dotenv`](https://www.npmjs.com/package/dotenv) to help load these up.

## Loading the Schema

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
     * an `Error` object with a `message` property describing the error.
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

A translator takes both a model and a validator, and provides a way to translate some user input into objects within our schema.
To do so, it crafts a prompt based on the schema, reaches out to the model, parses out JSON data, and attempts validation.
Optionally, it will craft repair prompts and retry if validation failed..

```ts
const translator = createJsonTranslator(model, validator);
```

When we are ready to translate a user request, we can call the `translate` method.

```ts
translator.translate("Hello world! 🙂");
```

We'll come back to this.

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
This will correspond to the type that we passed in when we created our translator object (i.e. `SentimentResponse`).

That's it!
You should now have a basic idea of TypeChat's APIs and how to get started with a new project. 🎉
