---
layout: doc-page
title: Techniques
---

This document defines techniques for working with TypeChat.

### Schema Engineering

TypeChat replaces _prompt engineering_ with _schema engineering_: Instead of writing unstructured natural language prompts to describe the format of your desired output, you write TypeScript type definitions. These TypeScript schema aren't necessarily the exact types your application uses to process and store your data. Rather, they're types that bridge between natural language and your application logic by _controlling and constraining_ LLM responses in ways that are meaningful to your application. To use an analogy, in the Model-View-ViewModel (MVVM) user interface design pattern, the ViewModel bridges between the user interface and the application logic, but it isn't the model the application uses to process and store information. The schema you design for TypeChat are like the ViewModel, but are perhaps more meaningfully called _Response Models_. To maximize success with TypeChat, we recommend the following best practices when defining Response Model types:

* Keep it simple (primitives, arrays, and objects).
* Only use types that are representable as JSON (i.e. no classes).
* Make data structures as flat and regular as possible.
* Include comments on types and properties that describe intent in natural language.
* Restrict use of generics.
* Avoid deep inheritance hierarchies.
* Don't use conditional, mapped, and indexed access types.
* Allow room for LLMs to color slightly outside the lines (e.g. use `string` instead of literal types).
* Include an escape hatch to suppress hallucinations.

The last point merits further elaboration. We've found that when Response Models attempt to fit user requests into narrow schema with no wiggle room, the LLMs are likely to hallucinate answers for user requests that are outside the domain. For example, if you ask your coffee shop bot for "two tall trees", given no other option it may well turn that into two tall lattes (without letting you know it did so). However, when you include an _escape hatch_ in the form of an "unknown" category in your schema, the LLMs happily route non-domain requests into that bucket. Not only does this greatly suppress hallucinations, it also gives you a convenient way of letting the user know which parts of a request weren't undestood. The examples in the TypeChat repo all use this technique.