# Crossword

The Crossword example shows how to include an image in a multimodal prompt and use the image to answer a user's question. The responses follow the  [`CrosswordActions`](./src/crosswordSchema.ts) type.

## Target models

This example explores multi-modal input. Torun this, you will need a model that accepts images as input. The example has beeentested with **gpt-4-vision** and **gpt-4-omni** models.

# Try Crossword
To run the Crossword example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found in [`src/input.txt`](./src/input.txt).

For example, given the following input statement:

**Input**:
```
🏁> What is the clue for 61 across
```

**Output**:
```
"Monogram in French fashion"
```