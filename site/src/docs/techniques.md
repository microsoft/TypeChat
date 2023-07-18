---
layout: doc-page
title: Techniques
---

This document defines techniques for working with TypeChat.

### Schema Engineering

To maximize success with TypeChat, we recommend the following best practices when defining types:

* Keep it simple (primitives, arrays, and objects)
* Only use types that are representable as JSON (i.e. no classes)
* Make data structures as flat and regular as possible
* Include comments on types and properties that describe intent in natural language
* Restrict use of generics
* Avoid and deep inheritance hierarchies
* Don't use conditional, mapped, and indexed access types
* Allow room for LLMs to color slightly outside the lines (e.g. string vs. literal types)
* Include an escape hatch to suppress hallucinations