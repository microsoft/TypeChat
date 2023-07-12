### What is TypeChat?
TypeChat is a small experimental library for getting structured data from large language models using TypeScript types. It makes it easier to add a natural language interface to your app by taking care of structuring and parsing responses from AI models.

The idea is that you can provide some prompt and the type definitions of the expected answer. TypeChat communicates with models to get you a validated well-typed answer based on a prompt. 

### Why is TypeChat useful?
If you want to add a natural language interface to an app – for example, let’s assume a coffee ordering app that let’s you speak out your order – then you eventually need to translate a request into something precise and concrete that your app can process for tasks like billing, ordering, etc. 

TypeChat lets you push on AI models to do this work without having to worry about how to parse out its response or dealing with “imaginary” items and tasks. This is because everything must be structured JSON that is validated against your types. 

### How does TypeChat work? How does TypeChat relate to TypeScript?
TypeChat uses TypeScript types as the “specification language” for responses from language models. The approach for sending a request is fairly minimal here. 

 Once receiving an AI response, TypeChat uses the TypeScript compiler API under the hood to validate the data based on the types you provided. That’s how TypeChat can guarantee that your response is correctly typed. 

### What languages does TypeChat support?
Currently TypeChat is being developed just for TypeScript and JavaScript. The library is still experimental, but we may consider support for other languages if there is interest. 

### How does TypeChat compare with libraries like LangChain?
TypeChat is not a replacement for libraries like LangChain. Similar libraries have a broader scope, such as “tools” and “agents” (a.k.a. skills and planners). TypeChat is much more focused on specifying and parsing structured data. 

In that sense, TypeChat can be used within libraries like LangChain, which provide similar utilities like Structured Output Parsers. TypeChat can instead be used to create a custom parser within a library like LangChain. 

### How does TypeChat compare to LangChain's built-in structured output parser?
Other approaches like LangChain’s Structured Output Parser take in a runtime type validation object and translate it to JSON schema, a format that’s most-often used to validate configuration files. JSON schema is powerful, but it is relatively uncommon for most programmers. 

TypeChat’s biggest strength is the fact that TypeScript types are so widely used and understood. This makes them easier to inspect when debugging and easier for LLMs to “understand”. 

Given this, there is no reason TypeChat cannot be used as its own parser, or that libraries cannot take a similar approach by using TypeScript types! 