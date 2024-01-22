from typing_extensions import Literal, TypedDict, Annotated, Doc


class Sentiment(TypedDict):
    """
    The following is a schema definition for determining the sentiment of a some user input.
    """

    sentiment: Annotated[Literal["negative", "neutral", "positive"], Doc("The sentiment for the text")]
