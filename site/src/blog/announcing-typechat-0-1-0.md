---
title: Announcing TypeChat 0.1.0
layout: blog
tags: post
authors: ["Daniel Rosenwasser"]
---

# {{title}}

*{{date | formatDate}}{% if authors %} by {{authors | formatList}}{% endif %}*

Today we've released a new version of TypeChat for TypeScript and JavaScript. To get it, you can run

```sh
npm install typechat
```

As a refresher, TypeChat is an experimental library for getting structured output (like JSON) from AI language models.
The way it works is by using types in your programs to guide language models, and then using those same types to ensure that the responses match up with your types.
When they don't, TypeChat can use validation errors to guide language models to repair their responses.
You can [read our original announcement blog post](./introducing-typechat) for more details, but we should be able to catch you up to speed here too.

Here's a few things that are new to TypeChat for TypeScript.

## Pluggable Validators

The original version of TypeChat actually leveraged the raw contents of a TypeScript schema file.
It looked something like this:

```ts
// Load up the contents of our "Response" schema.
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const translator = typechat.createJsonTranslator<SomeType>(model, schema, "SomeType");

// Process requests interactively.
typechat.processRequests("> ", /*inputFile*/ undefined, async (request) => {
    const response = await translator.translate(request);

    if (response.success) {
        console.log(`❌ ${response.message}`);
        return;
    }

    console.log("The request was translated into the following value:")
    console.log(response.data);
});
```

This worked, but had a few issues:

1. The schema file had to be self-contained. Everything had to be in the same file for TypeChat.
1. The schema file also had to be present if you weren't running in-place.

   This often meant copying the schema file along to the output directory if you weren't using something like ts-node, tsx, or tsimp.

1. The schema was fixed. While possible to generate a text schema on the fly, it's an error-prone task.

While there are a lot of ergonomic benefits to using a textual TypeScript schema, we explored whether there we could add a bit more flexibility and made a few changes to TypeChat.

The first is that we've broken out a piece of `TypeChatJsonTranslator` into a more granular concept: a `TypeChatJsonValidator`.
A `TypeChatJsonValidator` is responsible for generating a string schema representation to guide language models, and to actually make sure the data that comes back matches some type.
This means that to construct a `TypeChatJsonTranslator`, you need to make a `TypeChatJsonValidator` first;
but it also means that validators are swappable.
Here's what using that looks like now:

```ts
import fs from "fs";
import path from "path";

import { createLanguageModel, createJsonTranslator } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";

import { SentimentResponse } from "./sentimentSchema";

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<SentimentResponse>(schema, "SentimentResponse");
const translator = createJsonTranslator(model, validator);

translator.translate("hello world!").then(response => {
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
```

Notice that instead of passing the schema into `createJsonTranslator`, we're passing it into `createTypeScriptJsonValidator` which we need to import from `typechat/ts`.
The created validator the needs to be passed into `createJsonTranslator`.

For existing calls to `createJsonTranslator`, you'll probably see a message like:

> TS2554: Expected 2 arguments, but got 3.

you'll need to drop the name of the type, and substitute the argument schema with a validator.
Here's the effective diff:

```diff
  import { createJsonTranslator, createLanguageModel, processRequests } from "typechat";
+ import { createTypeScriptJsonValidator } from "typechat/ts";
  import { SentimentResponse } from "./sentimentSchema";

...

- const translator = createJsonTranslator<SentimentResponse>(model, schema, "Sentiment")
+ const validator = createTypeScriptJsonValidator<SentimentResponse>(schema, "SentimentResponse");
+ const translator = createJsonTranslator(model, validator);

...
```

## Zod Validators

The second change builds on pluggable validators: TypeChat makes it possible to create validators from Zod schemas.
[If you're not familiar with Zod](https://zod.dev/), it's a popular library in the TypeScript/JavaScript ecosystem for validating data.
One strength of this library is that as Zod type validator objects are constructed, static types can be derived from them.
But for TypeChat, its more notable strength is the ability to construct schemas *dynamically*.

To use a Zod-based schema, we first need to create a few Zod type validator objects and create an object defining all the ones we intend to use.

```ts
// sentimentSchema.ts

import { z } from "zod";

export const SentimentResponse = z.object({
    sentiment: z.enum(["negative", "neutral", "positive"])
        .describe("The sentiment of the text")
});

// Maps the property "SentimentResponse" to the above Zod validator.
export const SentimentSchema = {
    SentimentResponse
};
```

Note that while TypeScript schema files can use raw JavaScript/TypeScript `// comment` syntax, TypeChat generates comments from Zod based on [whatever we pass in to `.describe()` calls](https://zod.dev/?id=describe).

Next, we have to construct a TypeChat Zod validator.
We pass in the object map of types, and specify which type we want the model to conform to:

```ts
// main.ts

import { createJsonTranslator, createLanguageModel } from "typechat";
import { createZodJsonValidator } from "typechat/zod";

import { SentimentSchema } from "./sentimentSchema";

const model = createLanguageModel(process.env);
const validator = createZodJsonValidator(SentimentSchema, "SentimentResponse");
const translator = createJsonTranslator(model, validator);

translator.translate("hello world!").then(response => {
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
```

That's it!

While using a Zod schema has lots of advantages, you may still prefer the ergonomics of writing a plain TypeScript schema.
Either option works!

## A `validateInstance` Hook

Another new addition to TypeChat is the `validateInstance` hook on `TypeChatJsonTranslator`s.
It allows you to tack on an extra level of validation beyond what the internal validator will perform.

```ts
import { createJsonTranslator, error, success } from "typechat";

// ...

const translator = createJsonTranslator(model, validator);
translator.validateInstance = summary => {
    for (const person of summary.people) {
        if (person.age < 0) {
            return error(
                `'{person.name}' has a negative age, that doesn't make sense.`
            )
        }
    }
    return success(summary)
}
```

If `validateInstance` returns a TypeChat `Error`, then the translator will use the message to repair the AI response.

## Other Changes

Other changes to be aware of are:

* `TypeChatJsonProgram` and related functions, such as `createModuleTextFromProgram`, `evaluateJsonProgram`, and `createProgramTranslator` all live in `typechat/ts`.
* The `processRequests` function for creating a REPL-like prompt now lives in `typechat/interactive`.

## What's Next?

We'll be trying to improve TypeChat based on the feedback we receive.
We're also working to bring TypeChat to other language ecosystems, like Python and .NET, so keep an eye out for that in the near future.

Give TypeChat a try and let us know what you think over [on GitHub](https://github.com/microsoft/TypeChat/), where you can file an issue or post a topic in our discussion forum!

