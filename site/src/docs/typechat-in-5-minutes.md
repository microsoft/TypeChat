---
layout: doc-page
title: TypeChat in 5 Minutes
---

Currently TypeChat's a very small library, so let's start breaking down a few functions to better understand how to use it.

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
You can use a library like [`dotenv`](https://www.npmjs.com/package/dotenv) to help load these up as we did above.

## Loading the Schema

The first big idea around TypeChat is that we need to provide a set of type definitions to guide AI responses.
That means that we'll need to literally load up an input `.ts` file verbatim.

```ts
// Load up the type from our schema.
import type { SentimentResponse } from "./sentimentSchema";

// Load up the schema file contents.
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
```

This introduces some complications to certain kinds of builds, since our input files need to be treated as local assets.
One way to achieve this is to use a runtime or tool like [`ts-node`](https://www.npmjs.com/package/ts-node) to both import the file for its types, as well as read the file contents.
Another is to use a utility like [`copyfiles`](https://www.npmjs.com/package/copyfiles) to move specific schema files to the output directory.
If you're using a bundler, there might be custom way to import a file as a raw string as well.
Regardless, [our examples](https://github.com/microsoft/TypeChat/tree/main/examples) should work with either of the first two options.

## Creating a JSON Translator

TypeChat provides functions to construct two types of *translators*:

- `createJsonTranslator`: these get well-typed JSON data with based on some types, and
- `createProgramTranslator`: these get a well-typed representation of a program based on some typed API

The first tends to be simpler, so that's what we'll focus on for the remainder of this example.

```ts
const translator =
    typechat.createJsonTranslator<SentimentResponse>(model, schema, "SentimentResponse");
```

A translator takes a model, the schema file contents, and the name of a type within the schema file.
A schema file can declare many types, but the one our response conforms to must be exported, and we have to specify its name to TypeChat.
In a sense, you can think of this type as the "entry-point" of our schema for our language model.

The translator also takes a type argument for the actual type we've imported from our schema.
This should correspond *exactly* to the name of the type within the schema, and so you *must* watch out for typos here.

## Creating the Prompt

TypeChat exports a `processRequests` function that makes it easy to experiment with TypeChat.
It either creates an interactive command line prompt, or reads in lines from a file.

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
