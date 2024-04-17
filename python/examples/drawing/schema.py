"""TypeChat schema for simple line drawings."""


from typing_extensions import Literal, NotRequired, TypedDict, Annotated, Doc


class Style(TypedDict):
    type: Literal["Style"]
    corners: Literal["rounded", "sharp"]
    # We'll add things like line thickness, color, fill, etc. later


class Box(TypedDict):
    """A rectangular box.

    The coordinate system has origin top left, x points right, y points down.
    Measurements are in pixels.

    There can also be text in the box. There are optional style properties.

    """
    type: Literal["Box"]
    x: Annotated[int, Doc("Top left corner coordinates")]
    y: int
    width: Annotated[int, Doc("Size of the box")]
    height: int
    text: Annotated[str, Doc("Text centered in the box")]
    style: Annotated[Style | None, Doc("Box drawing style (optional)")]


class UnknownText(TypedDict):
    """
    Use this type for input that match nothing else
    """

    type: Literal["Unknown"]
    text: Annotated[str, Doc("The text that wasn't understood")]


class Drawing(TypedDict):
    """
    A drawing is a list of boxes. (We'll add other elements later, like arrows.)
    """
    items: list[Box | UnknownText]
