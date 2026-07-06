# Coffee Shop

The Coffee Shop example shows how to capture user intent as a set of "nouns".
In this case, the nouns are items in a coffee order, where valid items are defined starting from the [`Cart`](./schema.py) type.
This example also uses the [`UnknownText`](./schema.py) type as a way to capture user input that doesn't match to an existing type in [`Cart`](./schema.py).

# Try Coffee Shop

To run the Coffee Shop example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage

Example prompts can be found in [`src/input.txt`](./input.txt) and [`src/input2.txt`](./input2.txt).

For example, we could use natural language to describe our coffee shop order:

**Input**:

```
☕> we'd like a cappuccino with a pack of sugar
```

**Output**:

```json
{
  "items": [
    {
      "type": "lineitem",
      "product": {
        "type": "LatteDrinks",
        "name": "cappuccino",
        "options": [
          {
            "type": "Sweeteners",
            "name": "sugar",
            "optionQuantity": "regular"
          }
        ]
      },
      "quantity": 1
    }
  ]
}
```