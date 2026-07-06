# Drawing

The Drawing example mirrors the Python drawing sample from PR #238. It translates natural language requests into a [`Drawing`](./src/drawingSchema.ts) object containing boxes, ellipses, arrows, and unknown text.

For each successful translation, it writes an SVG rendering to `dist/drawing.svg`.

# Try Drawing
To run the Drawing example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found in [`src/input.txt`](./src/input.txt).

From the `drawing` directory:

```sh
node ./dist/main.js ./dist/input.txt
```
