import { Arrow, Box, Drawing, Ellipse, Style } from "./drawingSchema";

function escapeXml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&apos;");
}

function lineDash(style?: Style): string | undefined {
    switch (style?.line_style) {
        case "dashed":
            return "6 4";
        case "dotted":
            return "2 3";
        default:
            return undefined;
    }
}

function stroke(style?: Style): string {
    return style?.line_color ?? "black";
}

function strokeWidth(style?: Style): number {
    return style?.line_thickness ?? 1;
}

function fill(style?: Style): string {
    return style?.fill_color ?? "none";
}

function renderBox(item: Box): string {
    const rounded = item.style?.corners === "rounded";
    const text = item.text ? `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2}" text-anchor="middle" dominant-baseline="middle">${escapeXml(item.text)}</text>` : "";
    return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"${rounded ? " rx=\"8\" ry=\"8\"" : ""} stroke="${stroke(item.style)}" stroke-width="${strokeWidth(item.style)}" fill="${fill(item.style)}" />${text}`;
}

function renderEllipse(item: Ellipse): string {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const text = item.text ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${escapeXml(item.text)}</text>` : "";
    return `<ellipse cx="${cx}" cy="${cy}" rx="${item.width / 2}" ry="${item.height / 2}" stroke="${stroke(item.style)}" stroke-width="${strokeWidth(item.style)}" fill="${fill(item.style)}" />${text}`;
}

function renderArrow(item: Arrow): string {
    const dash = lineDash(item.style);
    return `<line x1="${item.start_x}" y1="${item.start_y}" x2="${item.end_x}" y2="${item.end_y}" stroke="${stroke(item.style)}" stroke-width="${strokeWidth(item.style)}"${dash ? ` stroke-dasharray="${dash}"` : ""} marker-end="url(#arrowhead)" />`;
}

function getCanvasSize(drawing: Drawing): { width: number; height: number } {
    let maxX = 800;
    let maxY = 600;
    for (const item of drawing.items) {
        switch (item.type) {
            case "Box":
            case "Ellipse":
                maxX = Math.max(maxX, item.x + item.width + 40);
                maxY = Math.max(maxY, item.y + item.height + 40);
                break;
            case "Arrow":
                maxX = Math.max(maxX, item.start_x + 40, item.end_x + 40);
                maxY = Math.max(maxY, item.start_y + 40, item.end_y + 40);
                break;
        }
    }
    return { width: maxX, height: maxY };
}

export function renderDrawingToSvg(drawing: Drawing): string {
    const { width, height } = getCanvasSize(drawing);
    const shapes = drawing.items.flatMap((item) => {
        switch (item.type) {
            case "Box":
                return [renderBox(item)];
            case "Ellipse":
                return [renderEllipse(item)];
            case "Arrow":
                return [renderArrow(item)];
            default:
                return [];
        }
    });

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        "<defs>",
        "<marker id=\"arrowhead\" markerWidth=\"10\" markerHeight=\"7\" refX=\"9\" refY=\"3.5\" orient=\"auto\">",
        "<polygon points=\"0 0, 10 3.5, 0 7\" fill=\"black\" />",
        "</marker>",
        "</defs>",
        "<rect width=\"100%\" height=\"100%\" fill=\"white\" />",
        ...shapes,
        "</svg>",
    ].join("\n");
}
