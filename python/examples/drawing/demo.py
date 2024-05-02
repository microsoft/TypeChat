import asyncio
import sys
import tkinter as tk

from dotenv import dotenv_values

import schema
from render import render_drawing

from typechat import (
    Success,
    Failure,
    TypeChatJsonTranslator,
    TypeChatValidator,
    create_language_model,
    process_requests,
)


async def main(file_path: str | None):
    env_vals = dotenv_values()
    model = create_language_model(env_vals)
    validator = TypeChatValidator(schema.Drawing)
    translator = TypeChatJsonTranslator(model, validator, schema.Drawing)
    # print(translator._schema_str)

    window = tk.Tk()
    window.title("Click to continue...")
    canvas = tk.Canvas(window, width=800, height=600, bg="white", highlightthickness=0)
    canvas.pack(padx=10, pady=10)
    canvas.bind("<Button-1>", lambda event: window.quit())

    history: list[str] = []

    async def request_handler(request: str):
        history.append(request)
        result: Success[schema.Drawing] | Failure = await translator.translate("\n".join(history))
        if isinstance(result, Failure):
            print("Failure:", result.message)
        else:
            value: schema.Drawing = result.value
            print(value)
            if any(isinstance(item, schema.UnknownText) for item in value.items):
                print("Unknown text detected. Please provide more context:")
                for item in value.items:
                    if isinstance(item, schema.UnknownText):
                        print(" ", item.text)

            canvas.delete("all")
            render_drawing(canvas, value)
            window.mainloop()

    await process_requests("~> ", file_path, request_handler)


if __name__ == "__main__":
    file_path = sys.argv[1] if len(sys.argv) == 2 else None
    asyncio.run(main(file_path))
