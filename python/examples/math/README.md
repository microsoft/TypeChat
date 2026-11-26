# Math

The Math example translates calculations into JSON programs that call the functions in
[`MathAPI`](./schema.py). The [program translator](./program.py) puts **both** the
JSON program schema and the calculator API schema in its system message. The
calculation request is a separate user message. `use_legacy_prompt=True` keeps the
previous combined user prompt. In both layouts, `evaluate_json_program` evaluates
the validated program using the example's operations.

# Try Math

To run the Math example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage

Example prompts can be found in [`input.txt`](./input.txt).

For example, we could use natural language to describe mathematical operations, and TypeChat will generate a program that can execute the math API defined in the schema.

**Input**:

```
🟰> multiply two by three, then multiply four by five, then sum the results
```

**Output**:

```
{
  "@steps": [
    {"@func": "mul", "@args": [2, 3]},
    {"@func": "mul", "@args": [4, 5]},
    {"@func": "add", "@args": [{"@ref": 0}, {"@ref": 1}]}
  ]
}
mul([2, 3])
mul([4, 5])
add([6, 20])
Math Result: 26
```
