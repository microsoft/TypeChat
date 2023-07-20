# Coffee Shop

The Coffee Shop example shows how to capture user intent as a set of nouns - in this case, the items in a coffee order - for an conversational order agent for a coffee shop as defined by the [`Cart`](./src/coffeeShopSchema.ts) type. This example also uses the [`UnknownText`](./src/coffeeShopSchema.ts) type as a way to capture user input that doesn't match to an existing type in [`Cart`](./src/coffeeShopSchema.ts).

# Try Coffee Shop
To run the Coffee Shop example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found at [`src/input.txt`](./src/input.txt). This example also includes an additional [`src/input2.txt`](./src/input2.txt).

For example, I could use natural language to describe my coffee shop order:

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