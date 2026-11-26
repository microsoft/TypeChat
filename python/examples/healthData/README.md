# Health Data Agent

This example requires GPT-4.

Demonstrates a ***strongly typed*** chat: a natural language interface for entering health information. You work with a *health data agent* to interactively enter your medications or conditions.

The Health Data Agent shows how strongly typed **agents with history** could interact with a user to collect information needed for one or more data types ("form filling").

The [example translator](./translator.py) reads the current date and time once per
turn so relative dates use the current clock. In the default layout, the clock,
schema, and application instructions go in the system message. Only earlier
**validated results** are saved and replayed as assistant messages; failed turns,
repair diagnostics, and raw user input are not saved. Each new request goes in
its own user message. `use_legacy_prompt=True` instead uses the example's old
combined user prompt, including its serialized history.

## Target models

For best and consistent results, use **gpt-4**.

## Try the Health Data Agent

To run the Health Data example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

## Usage

Example prompts can be found in [`input.txt`](./input.txt).

For example, given the following input statement:

**Input**:

```console
🤧> I am taking klaritin for my allergies

```

**Output**:
