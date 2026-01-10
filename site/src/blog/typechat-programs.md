---
title: Taking a Look at TypeChat's Concept of Programs
layout: blog
tags: post
date: 2023-09-07
authors: ["Daniel Rosenwasser"]
---

# {{title}}

*{{date | formatDate}}{% if authors %} by {{authors | formatList}}{% endif %}*

[When we announced TypeChat](./introducing-typechat.md), we focused heavily on translating a "user intent" into structured well-typed data in the form of JSON.
That made it easy to understand the core idea of TypeChat, it left another feature out of the announcement: TypeChat Programs.

TypeChat Programs are all about accomplishing a set of well-typed steps in a limited environment.
Maybe you've heard the terms "planning", "scripting", or "orchestration" for doing something like this.

For some background, let's assume we want to make a chatbot of some sort that can read, write, and edit files.
We don't want to give the chatbot direct access to the file system because that would be a security risk.
Instead, we want to give it a set of commands that it can execute.

We can use TypeChat to help us accomplish this.
With TypeChat, we might define a set of commands in TypeScript like the following:

```ts
export type Command =
    | ReadFileCommand
    | WriteFileCommand
    | TrimStringCommand;

export interface ReadFileCommand {
    commandName: "readFile";
    filePath: string;
}

export interface WriteFileCommand {
    commandName: "writeFile";
    filePath: string;
    contents: string;
}

export interface TrimStringCommand {
    commandName: "trimString";
    input: string;
}
```

This is a good start, but using TypeChat today, each user intent is converted into a single command.
What if we want to support a sequence of commands?
For example, what if we want to support a command like `readFile`, followed by `trimString`, followed by `writeFile`?

We could try to define a new type called `CommandSequence` that's just an array of commands:

```ts
export type CommandSequence = Command[];

export type Command =
    | ReadFileCommand
    | WriteFileCommand
    | TrimStringCommand;

// ...
```

There are a few problems with this approach.
First off, let's imagine the response we might get from a language model.

```jsonc
{
  "commands": [
    {
      "commandName": "readFile",
      "filePath": "some-file.txt"
    },
    {
      "commandName": "trimString",
      "input": /* ??? */
    },
    {
      "commandName": "writeFile",
      "filePath": "some-file.txt",
      "contents": /* ??? */
    }
  ]
}
```

We need a way to describe how the outputs of specific commands can flow into the inputs of other commands.
How does a `trimString` command get its input from the `readFile` command?
How does the `writeFile` command get its `contents` from the `trimString` command?

We could try to have every command specify a property named `input` or something with a consistent name, but that removes a lot of flexibility.
It would mean that no command can have more than one input.
It would also mean that we can't reuse the result of a command in multiple places.

You might notice that we're spending a lot of time trying to describe something very basic in most programming languages: variables and function calls.
In the above, we're describing a set of commands that can be issued.
That's really no different than describing a set of functions that can be called.

We quickly realized that the JSON translation mechanism was too limited for something like this use case, *but*, we could still use TypeScript to describe the same thing!
What if we took a similar approach, but in which we simply described a set of methods that could be called?

```ts
export type API = {
    readFile: (filePath: string) => string;
    writeFile: (filePath: string, contents: string) => void;
    trimString: (input: string) => string;
};
```

Using the same technique, we've found that these APIs can guide language models to produce programs where the inputs and outputs are connected in a meaningful way.

This is the core idea of TypeChat Programs.
All we need to do is specify a type set of functions that can be called, and TypeChat will guide a given language model to produce a small program represented in JSON.

```ts
import * as typechat from "typechat";
// ...

async function main() {
    // ...

    const model = typechat.createLanguageModel(process.env);
    const schema = fs.readFileSync(path.join(__dirname, "someSchema.ts"), "utf8");

    // Note we are using 'createProgramTranslator', not 'createJsonTranslator'.
    const translator = typechat.createProgramTranslator(model, schema);
    
    const result = await translator.translate(
        "Read 'foo.txt', trim its whitespace, and then save it to 'bar.txt'."
    );
    
    const jsonProgram = typechat.getData(result);
    console.log(JSON.stringify(jsonProgram, undefined, 2));
}

main();
```

This program outputs the following:

```json
{
  "@steps": [
    {
      "@func": "readFile",
      "@args": [
        "foo.txt"
      ]
    },
    {
      "@func": "trimString",
      "@args": [
        {
          "@ref": 0
        }
      ]
    },
    {
      "@func": "writeFile",
      "@args": [
        "bar.txt",
        {
          "@ref": 1
        }
      ]
    }
  ]
}
```

What's more, we can use the TypeScript compiler to further validate the response.
TypeChat has the capability to transform this into a real TypeScript program, and we can even preview this by adding two lines to the example above:
    
```ts
const moduleText = typechat.getData(typechat.createModuleTextFromProgram(jsonProgram));
console.log(moduleText);
```

which will print out the following:

```ts
import { API } from "./schema";
function program(api: API) {
  const step1 = api.readFile("foo.txt");
  const step2 = api.trimString(step1);
  return api.writeFile("bar.txt", step2);
}
```

During the program translation step, the TypeScript compiler is able to use this representation to ensure that *each of these steps is well-typed*.

## Evaluating

To make this useful, we still need to implement each of the `API` methods in some way.
TypeChat has an `evaluateJsonProgram` function for this, and provides a callback with the method name and arguments for each step.

```ts
typechat.evaluateJsonProgram(jsonProgram, async (func, args) => {
    switch (func) {
        case "readFile": {
            const [filePath] = args as [string];
            return fs.readFileSync(filePath, { encoding: "utf8" });
        }
        case "writeFile": {
            const [filePath, contents] = args as [string, string];
            fs.writeFileSync(filePath, contents, { encoding: "utf8" });
        }
        case "trimString": {
            const [input] = args as [string];
            return input.trim();
        }
    }
});
```

Notice that this callback is `async`.
We *could* use the asynchronous versions of `readFile` and `writeFile` if we wanted to without making any changes to the schema.
Asynchronicity is abstracted away in the API, simplifying the schema for the language model.

You might have also noticed that this callback us using a lot of type assertions because the callback is fairly untyped.
While the API usage is type-safe, the callback is not.
We can define an object that satisfies the `API` interface and use that instead.

```ts
const handlers = {
    readFile(filePath) {
        return fs.readFileSync(filePath, { encoding: "utf8" });
    },
    writeFile(filePath, contents) {
        fs.writeFileSync(filePath, contents, { encoding: "utf8" });
    },
    trimString(input) {
        return input.trim();
    },
} satisfies API;
Object.setPrototypeOf(handlers, null);

// ...

typechat.evaluateJsonProgram(jsonProgram, async (func, args) => {
    return (handlers as any)[func](...args);
});
```

If we chose to make our handlers asynchronous, we could derive a type from `API` where each function can return a `Promise` of its original return type.

```ts
type PossiblyAsync<T> = T | Promise<Awaited<T>>;

type AsyncAPI = {
    [K in keyof API]: (...args: Parameters<API[K]>) => PossiblyAsync<ReturnType<API[K]>>;
};

const handlers = {
    readFile(filePath) {
        return fsPromises.readFile(filePath, { encoding: "utf8" });
    },
    writeFile(filePath, contents) {
        fsPromises.writeFile(filePath, contents, { encoding: "utf8" });
    },
    trimString(input) {
        return input.trim();
    },
} satisfies AsyncAPI;
```

## Early Alternatives

When designing TypeChat Programs, we played around with several different concepts.
One idea we had was to generate a JavaScript program that could be executed directly.
While lots of great work is underway in JavaScript to do so more securely, we wanted something more general that could eventually work in other languages, and which had a much smaller "attack surface".

On that same note, the programs that TypeChat permits are very limited.
There is no direct support for loops, conditionals, nor recursion.
This is by design to enable availability protection by default.

All of this also is part of what led us to using JSON as the representation of our programs.
We found that when using TypeScript or JavaScript directly, language models tended to "draw outside the lines" and use methods that were not defined within the API.
This meant lots of repair steps that were undesirable.

## Similar Approaches

There are lots of similar approaches to TypeChat Programs.
We've met with teams trying custom languages to perform "planning"/"scripting"/"orchestration", and they are good approaches.
There are definitely trade-offs, but we want to push forward with is something simple and oriented around types in the underlying language.
In other words, *all you need is types*.

We've also seen very exciting work from OpenAI Functions in which a language model can select from a set of functions to call.
While we're enthused about the support for language models to kick off programmatic work, this approach is currently limited to performing a single set of functions at a time.
It's also not fully supported by all language models at the moment, and while we may see broader adoption by other language models, TypeChat is model agnostic here and can run on any sufficiently powerful language model.

In a similar vein, LangChain Agents and Semantic Kernel Planners can also be used to perform a series of tasks &mdash; the most comparable being plan-and-execute agents.
While powerful, this technique feels optimized around tools and skills that may expect unstructured data, or operate defensively against unstructured data.
TypeChat, on the other hand, is constantly focused around translating user intent into something structured and well-typed.

This ties into one of the big wins around TypeChat programs: the type-safety guaranteed between each step.

One thing we do encourage is to keep in mind is that all these ideas are still very young and are quickly developing.
The choices of how to design an application are really up to you, and you may find that you come up with a choice of choosing to use XYZ *and* TypeChat, rather than XYZ *or* TypeChat.

