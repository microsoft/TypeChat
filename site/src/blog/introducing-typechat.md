---
title: Introducting TypeChat
layout: blog
tags: post
---

# Introducing TypeChat

In the last few months, we've seen a rush of excitement around the newest wave of large language models.
While chat assistants have been the been the most direct application, there's a big question around how to best integrate these models into existing app interfaces.

In other words, how do we *augment* traditional UI with natural language interfaces?
How do we use AI to take a user request and turn it into something our apps can operate on?
And how do we make sure our apps are safe, and doing work that developers and users alike can trust?

Today we're releasing **TypeChat**, an experimental library that aims to answer these questions.
It uses the type definitions in your codebase to retrieve structured AI responses that are type-safe.

You can get up and running with TypeChat today by running

```
npm install typechat
```

and hooking it up with any language model to work with your app.

But let's first quickly explore why TypeChat exists.

## Pampering and Parsing

The current wave of LLMs default to conversational *natural* language — languages that humans communicate in like English.
Parsing natural language is an extremely difficult task, no matter how much you pamper a prompt with rules like "respond in the form a bulleted list".
Natural language might have structure, but it's hard for typical software to reconstruct it from raw text.

Surprisingly, we can ask LLMs to respond in the form of JSON, and they generally respond with something sensible!

> **User:**
> 
> Translate the following request into JSON.
> 
> > Could I get a blueberry muffin and a grande latte?
> 
> Respond only in JSON like the following:
> 
> ```json
> {
>     "items": [
>         { "name": "croissant", "quantity": 2  },
>         { "name": "latte", "quantity": 1, "size": "tall" }
>     ]
> }
> ```
> 
> **ChatBot:**
> 
> ```json
> {
>     "items": [
>         {
>             "name": "blueberry muffin",
>             "quantity": 1
>         },
>         {
>             "name": "latte",
>             "quantity": 1,
>             "size": "grande"
>         }
>     ]
> }
> ```

This is good — though this example shows the best-case response.
It's unfortunately easy to get a response that includes `{ "name": "grande latte" }`.
While examples can help guide structure, they don't define what an AI should return extensively, and they don't provide anything we can validate against.

## Just Add Types!

Luckily **types** do precisely that.
What we've found is that because LLMs have seen so many type definitions in the wild, types also act as a great guide for how an AI should respond.
Because we're typically working with JSON — *JavaScript* Object Notation — and because it's is very near and dear to our hearts, we've been using TypeScript types in our prompts.

> **User:**
> 
> Translate the following request into JSON.
> 
> > Could I get a blueberry muffin and a grande latte?
> 
> Respond only in JSON that satisfies the `Response` type:
> 
> ```ts
> type Response = {
>     items: Item[];
> };
> 
> type Item = {
>     name: string;
>     quantity: number;
>     size?: string;
>     notes?: string;
> }
> ```
>
> **ChatBot:**
>
> ```json
> {
>   "items": [
>     {
>       "name": "blueberry muffin",
>       "quantity": 1
>     },
>     {
>       "name": "latte",
>       "quantity": 1,
>       "size": 16
>     }
>   ]
> }
> ```

This is pretty great!
TypeScript has shown that it's well-suited to precisely describe JSON.
But what happens when a language model stumbles and makes up a response that doesn't conform to our types?

Well because these types are valid TypeScript code, we can validate the response against them using the TypeScript compiler itself!
In fact, the error feedback from the compiler can even be used to guide repairs.
When put together, we can get a robust process for getting well-typed responses that our apps can further massage, validate with a user, etc.

In other words, **types are all you need**.

## Enter TypeChat

The technique of combining a human prompt and a "response schema" is not necessarily unique — but it is promising.
And as we've focused on translating user intent to structured data, we've found that TypeScript is very well-suited for the task.
We've grown more confident with this approach, and in order to prove it out, we're releasing a library called TypeChat to help make it easier to use in your apps.
[TypeChat is already on npm](https://npmjs.com/package/typechat) if you want to try it now, and provides tools for prompt prototyping, schema validation, repair, and more.

Here's the basic code to hook TypeChat up to an LLM and decide if a sentence is negative, neutral, or positive.

```ts
// ./src/sentimentSchema.ts

// The following is a schema definition for determining the sentiment of a some user input.

export interface SentimentResponse {
    /** The sentiment of the text. */
    sentiment: "negative" | "neutral" | "positive";
}
```

```ts
// ./src/main.ts

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import * as typechat from "typechat";
import { SentimentResponse } from "./sentimentSchema";

// Load environment variables.
dotenv.config({ path: path.join(__dirname, "../.env") });

// Create a language model based on the environment variables.
const model = typechat.createLanguageModel(process.env);

// Load up the contents of our "Response" schema.
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const translator = typechat.createJsonTranslator<SentimentResponse>(model, schema, "SentimentResponse");

// Process requests interactively.
typechat.processRequests("😀> ", /*inputFile*/ undefined, async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
```

TypeChat can be used in a number of different ways.
The way we've discussed here so far is all about using a "data schema" to turn some user intent into a structured response;
however, TypeChat also makes it possible to use an "API schema" to construct basic programs.
We have some [docs](/docs/) and [examples](/docs/examples/) to get a sense of the different ways you can use TypeChat.

## Open and Pluggable

First of all, TypeChat is open-source.
We're MIT-licensed and you can [find us on GitHub](https://github.com/Microsoft/TypeChat) where we're eager to hear your thoughts, share our ideas, and build with you.

Second, TypeChat is built in a way that is meant to be model-neutral.
While we have some very basic integration with the OpenAI API and the Azure OpenAI service for convenience, this approach should work for any chat completion-style API that you want to use — though note that at the moment, TypeChat works best with models that have been trained on both prose and code.

## Try It Today!

We'd love to know if TypeChat is something that's useful and interests you!
As we mentioned, we'll be welcoming you on [GitHub](https://github.com/Microsoft/TypeChat) if you have any question, suggestions, and more.

Happy Hacking!
