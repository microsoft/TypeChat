# Sentiment

The Sentiment example shows how to match user intent to a set of nouns, in this case categorizing user sentiment of the input as negative, neutral, or positive with the [`SentimentResponse`](./src/sentimentSchema.ts) type.

# Try Sentiment
To run the Sentiment example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found at [`src/input.txt`](./src/input.txt).

For example, given the following input statement:

**Input**:
```
😀> TypeChat is awesome!
```

**Output**:
```
The sentiment is positive
```