// The following is a schema definition for determining the sentiment of a some user input.

export interface SentimentResponse {
    sentiment: "negative" | "neutral" | "positive";  // The sentiment of the text
}
