import tkinter as tk

from schema import Style, Box, Ellipse, Arrow, Drawing, UnknownText


# Map line style to dash patterns
dash_pattern = {
    "solid": "",
    "dashed": (4, 4),  # 4 pixels drawn, 4 pixels space
    "dotted": (1, 1),  # 1 pixel drawn, 1 pixel space
}


def render_drawing(drawing: Drawing):
    window = tk.Tk()
    window.title("Drawing")
    window.configure(bg="white")

    canvas = tk.Canvas(window, width=800, height=600, bg="white", highlightthickness=0)
    canvas.pack(padx=10, pady=10)

    def draw_box(box: Box):
        x1, y1 = box.x, box.y
        x2, y2 = x1 + box.width, y1 + box.height
        canvas.create_rectangle(
            x1,
            y1,
            x2,
            y2,
            outline=getattr(box.style, "line_color", None) or "black",
            fill=getattr(box.style, "fill_color", None) or "",
        )
        if box.text:
            canvas.create_text((x1 + x2) / 2, (y1 + y2) / 2, text=box.text, fill="black")

    def draw_ellipse(ellipse: Ellipse):
        x1, y1 = ellipse.x, ellipse.y
        x2, y2 = x1 + ellipse.width, y1 + ellipse.height
        canvas.create_oval(
            x1,
            y1,
            x2,
            y2,
            outline=getattr(ellipse.style, "line_color", None) or "black",
            fill=getattr(ellipse.style, "fill_color", None) or "",
        )
        if ellipse.text:
            canvas.create_text((x1 + x2) / 2, (y1 + y2) / 2, text=ellipse.text, fill="black")

    def draw_arrow(arrow: Arrow):
        canvas.create_line(
            arrow.start_x,
            arrow.start_y,
            arrow.end_x,
            arrow.end_y,
            dash=dash_pattern[getattr(arrow.style, "line_style", None) or "solid"],
            arrow=tk.LAST,
            fill=getattr(arrow.style, "line_color", None) or "black",
        )

    for item in drawing.items:
        match item:
            case Box():
                draw_box(item)
            case Ellipse():
                draw_ellipse(item)
            case Arrow():
                draw_arrow(item)
            case UnknownText():
                print(f"Unknown text: {item.text}")

    window.mainloop()


if __name__ == "__main__":
    example_drawing = Drawing(
        type="Drawing",
        items=[
            Box(
                type="Box",
                x=50,
                y=50,
                width=100,
                height=100,
                text="Hello",
                style=Style(type="Style"),
            ),
            Ellipse(
                type="Ellipse",
                x=200,
                y=50,
                width=150,
                height=100,
                text="World",
                style=Style(type="Style", fill_color="lightblue"),
            ),
            Arrow(
                type="Arrow",
                start_x=50,
                start_y=200,
                end_x=150,
                end_y=200,
                style=Style(type="Style", line_style="dashed"),
            ),
        ],
    )

    render_drawing(example_drawing)
