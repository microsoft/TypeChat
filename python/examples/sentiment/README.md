# Sentiment

The Sentiment example shows how to match user intent to a set of nouns, in this case categorizing user sentiment of the input as negative, neutral, or positive with the [`SentimentResponse`](./schema.py) type.

# Try Sentiment
To run the Sentiment example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found in [`input.txt`](./input.txt).

For example, given the following input statement:

**Input**:
```
😀> TypeChat is awesome!
```

**Output**:
```
The sentiment is positive
```

# Non-interactive usage

The self-contained [`non_interactive.py`](./non_interactive.py) example accepts one text argument, prints the validated result as JSON, and exits without prompting for input.
After configuring the environment as described in the [examples README](../README.md), run it from the `python` directory:

```sh
python examples/sentiment/non_interactive.py "TypeChat is awesome!"
```

Example output:

```json
{"sentiment": "positive"}
```

The example exposes an async `classify_sentiment` function for use in an existing backend and surfaces translation failures as exceptions.
See the [Python quickstart](../../../site/src/docs/python/non-interactive.md) for setup, error handling, and application integration.