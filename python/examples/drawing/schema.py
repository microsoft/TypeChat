"""Schema for a drawing with boxes, ellipses, arrows, etc."""

from dataclasses import dataclass
from typing_extensions import Literal, Annotated, Doc, Optional


@dataclass
class Style:
    """Style settings for drawing elements."""

    type: Literal["Style"]

    corners: Annotated[Optional[Literal["rounded", "sharp"]], Doc("Corner style of the drawing elements.")] = None
    line_thickness: Annotated[Optional[int], Doc("Thickness of the lines.")] = None
    line_color: Annotated[Optional[str], Doc("CSS-style color code for line color.")] = None
    fill_color: Annotated[Optional[str], Doc("CSS-style color code for fill color.")] = None
    line_style: Annotated[Optional[str], Doc("Style of the line: 'solid', 'dashed', 'dotted'.")] = None


@dataclass
class Box:
    """A rectangular box defined by a coordinate system with the origin at the top left."""

    type: Literal["Box"]

    x: Annotated[int, Doc("X-coordinate of the top left corner.")]
    y: Annotated[int, Doc("Y-coordinate of the top left corner.")]
    width: Annotated[int, Doc("Width of the box.")]
    height: Annotated[int, Doc("Height of the box.")]
    text: Annotated[Optional[str], Doc("Optional text centered in the box.")] = None
    style: Annotated[Optional[Style], Doc("Optional style settings for the box.")] = None


@dataclass
class Ellipse:
    """An ellipse defined by its bounding box dimensions."""

    type: Literal["Ellipse"]

    x: Annotated[int, Doc("X-coordinate of the top left corner of the bounding box.")]
    y: Annotated[int, Doc("Y-coordinate of the top left corner of the bounding box.")]
    width: Annotated[int, Doc("Width of the bounding box.")]
    height: Annotated[int, Doc("Height of the bounding box.")]
    text: Annotated[Optional[str], Doc("Optional text centered in the box.")] = None
    style: Annotated[Optional[Style], Doc("Optional style settings for the ellipse.")] = None


@dataclass
class Arrow:
    """A line with a directional arrow at one or both ends, defined by start and end points."""

    type: Literal["Arrow"]

    start_x: Annotated[int, Doc("Starting X-coordinate.")]
    start_y: Annotated[int, Doc("Starting Y-coordinate.")]
    end_x: Annotated[int, Doc("Ending X-coordinate.")]
    end_y: Annotated[int, Doc("Ending Y-coordinate.")]
    style: Annotated[Optional[Style], Doc("Optional style settings for the arrow.")] = None
    head_size: Annotated[Optional[int], Doc("Size of the arrowhead, if present.")] = None


@dataclass
class UnknownText:
    """Used for input that does not match any other specified type."""

    type: Literal["UnknownText"]

    text: Annotated[str, Doc("The text that wasn't understood.")]


@dataclass
class Drawing:
    """A collection of graphical elements including boxes, ellipses, arrows, and unrecognized text."""

    type: Literal["Drawing"]

    items: Annotated[list[Box | Arrow | Ellipse | UnknownText], Doc("List of drawable elements.")]
