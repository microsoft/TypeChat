from typing_extensions import Literal, TypedDict, Annotated, Doc, Optional


class Style(TypedDict):
    type: Literal["Style"]
    corners: Annotated[Literal["rounded", "sharp"], Doc("Corner style of the drawing elements.")]
    line_thickness: Annotated[Optional[int], Doc("Thickness of the lines.")]
    line_color: Annotated[Optional[str], Doc("CSS-style color code for line color.")]
    fill_color: Annotated[Optional[str], Doc("CSS-style color code for fill color.")]
    line_style: Annotated[Optional[str], Doc("Style of the line: 'solid', 'dashed', 'dotted'.")]


class Box(TypedDict):
    """A rectangular box defined by a coordinate system with the origin at the top left."""
    type: Literal["Box"]
    x: Annotated[int, Doc("X-coordinate of the top left corner.")]
    y: Annotated[int, Doc("Y-coordinate of the top left corner.")]
    width: Annotated[int, Doc("Width of the box.")]
    height: Annotated[int, Doc("Height of the box.")]
    text: Annotated[Optional[str], Doc("Optional text centered in the box.")]
    style: Annotated[Optional[Style], Doc("Optional style settings for the box.")]


class Ellipse(TypedDict):
    """An ellipse defined by its bounding box dimensions."""
    type: Literal["Ellipse"]
    x: Annotated[int, Doc("X-coordinate of the top left corner of the bounding box.")]
    y: Annotated[int, Doc("Y-coordinate of the top left corner of the bounding box.")]
    width: Annotated[int, Doc("Width of the bounding box.")]
    height: Annotated[int, Doc("Height of the bounding box.")]
    text: Annotated[Optional[str], Doc("Optional text centered in the box.")]
    style: Annotated[Optional[Style], Doc("Optional style settings for the ellipse.")]


class Arrow(TypedDict):
    """A line with a directional arrow at one or both ends, defined by start and end points."""
    type: Literal["Arrow"]
    start_x: Annotated[int, Doc("Starting X-coordinate.")]
    start_y: Annotated[int, Doc("Starting Y-coordinate.")]
    end_x: Annotated[int, Doc("Ending X-coordinate.")]
    end_y: Annotated[int, Doc("Ending Y-coordinate.")]
    style: Annotated[Optional[Style], Doc("Optional style settings for the arrow.")]
    head_size: Annotated[Optional[int], Doc("Size of the arrowhead, if present.")]


class UnknownText(TypedDict):
    """Used for input that does not match any other specified type."""
    type: Literal["Unknown"]
    text: Annotated[str, Doc("The text that wasn't understood.")]


class Drawing(TypedDict):
    """A collection of graphical elements including boxes, ellipses, arrows, and unrecognized text."""
    items: Annotated[list[Box | Arrow | Ellipse | UnknownText], Doc("List of drawable elements.")]
