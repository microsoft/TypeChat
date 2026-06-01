// Schema for a drawing with boxes, ellipses, arrows, and unknown text.

export interface Style {
    type: "Style";
    // Corner style for boxes.
    corners?: "rounded" | "sharp";
    // Thickness of outlines and arrows.
    line_thickness?: number;
    // CSS color for outlines and arrows.
    line_color?: string;
    // CSS color used to fill boxes and ellipses.
    fill_color?: string;
    // Style of arrow lines.
    line_style?: "solid" | "dashed" | "dotted";
}

export interface Box {
    type: "Box";
    // X-coordinate of top left corner.
    x: number;
    // Y-coordinate of top left corner.
    y: number;
    // Width in pixels.
    width: number;
    // Height in pixels.
    height: number;
    // Optional label centered in the box.
    text?: string;
    // Optional style settings.
    style?: Style;
}

export interface Ellipse {
    type: "Ellipse";
    // X-coordinate of top left corner of bounding box.
    x: number;
    // Y-coordinate of top left corner of bounding box.
    y: number;
    // Width in pixels.
    width: number;
    // Height in pixels.
    height: number;
    // Optional label centered in the ellipse.
    text?: string;
    // Optional style settings.
    style?: Style;
}

export interface Arrow {
    type: "Arrow";
    // Starting X-coordinate.
    start_x: number;
    // Starting Y-coordinate.
    start_y: number;
    // Ending X-coordinate.
    end_x: number;
    // Ending Y-coordinate.
    end_y: number;
    // Optional style settings.
    style?: Style;
    // Optional arrowhead size hint.
    head_size?: number;
}

export interface UnknownText {
    type: "UnknownText";
    // Text that was not understood.
    text: string;
}

export interface Drawing {
    type: "Drawing";
    // Items in the drawing.
    items: Array<Box | Ellipse | Arrow | UnknownText>;
}
