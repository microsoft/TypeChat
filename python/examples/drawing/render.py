import tkinter as tk

def render_drawing(drawing):
    # Create a new Tkinter window
    window = tk.Tk()
    window.title("Drawing")
    window.configure(bg='white')  # Set the background color of the window

    # Create a canvas widget
    canvas = tk.Canvas(window, width=800, height=600, bg='white', highlightthickness=0)
    canvas.pack(padx=10, pady=10)  # Adds 10 pixels of padding on all sides

    # Function to draw a box with text if provided
    def draw_box(box):
        x1, y1 = box['x'], box['y']
        x2, y2 = x1 + box['width'], y1 + box['height']
        fill = box['style'].get('fill_color', '') if box['style'] else ''
        canvas.create_rectangle(x1, y1, x2, y2, outline='black', fill=fill)
        if 'text' in box and box['text']:
            canvas.create_text((x1 + x2) / 2, (y1 + y2) / 2, text=box['text'], fill='black')

    # Function to draw an ellipse with text if provided
    def draw_ellipse(ellipse):
        x1, y1 = ellipse['x'], ellipse['y']
        x2, y2 = x1 + ellipse['width'], y1 + ellipse['height']
        fill = ellipse['style'].get('fill_color', '') if ellipse['style'] else ''
        canvas.create_oval(x1, y1, x2, y2, outline='black', fill=fill)
        if 'text' in ellipse and ellipse['text']:
            canvas.create_text((x1 + x2) / 2, (y1 + y2) / 2, text=ellipse['text'], fill='black')

    # Function to draw an arrow
    def draw_arrow(arrow):
        x1, y1 = arrow['start_x'], arrow['start_y']
        x2, y2 = arrow['end_x'], arrow['end_y']
        canvas.create_line(x1, y1, x2, y2, arrow=tk.LAST, fill='black')

    # Iterate through each item in the drawing and render it
    for item in drawing['items']:
        if item['type'] == 'Box':
            draw_box(item)
        elif item['type'] == 'Ellipse':
            draw_ellipse(item)
        elif item['type'] == 'Arrow':
            draw_arrow(item)

    # Button to close the window (pretty ugly -- use Cmd-W/Ctrl-W instead)
    # quit_button = tk.Button(window, text="Quit", command=window.quit)
    # quit_button.pack(side=tk.BOTTOM, pady=10)

    # Start the Tkinter event loop
    window.mainloop()

# Example usage:
if __name__ == '__main__':
    drawing = {
        'items': [
            {'type': 'Box', 'x': 50, 'y': 50, 'width': 100, 'height': 100, 'text': 'Hello', 'style': None},
            {'type': 'Ellipse', 'x': 200, 'y': 50, 'width': 150, 'height': 100, 'text': 'World', 'style': {'fill_color': 'lightblue'}},
            {'type': 'Arrow', 'start_x': 50, 'start_y': 200, 'end_x': 150, 'end_y': 200}
        ]
    }

    render_drawing(drawing)
