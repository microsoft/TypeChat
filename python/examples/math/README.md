# Math

The Math example shows how to use TypeChat for program generation based on an API schema with the `evaluateJsonProgram` function. This example translates calculations into simple programs given an [`API`](./schema.py) type that can perform the four basic mathematical operations.

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
import { API } from "./schema";
function program(api: API) {
  const step1 = api.mul(2, 3);
  const step2 = api.mul(4, 5);
  return api.add(step1, step2);
}
Running program:
mul(2, 3)
mul(4, 5)
add(6, 20)
Result: 26
```
