import sys
from typing import Callable, Awaitable

async def process_requests(interactive_prompt: str, input_file_name: str | None, process_request: Callable[[str], Awaitable[None]]):
    if input_file_name is not None:
        with open(input_file_name, "r") as file:
            lines = filter(str.rstrip, file)
            for line in lines:
                if line.startswith("# "):
                    continue
                print(interactive_prompt + line)
                await process_request(line)
    else:
        print(interactive_prompt, end="", flush=True)
        for line in sys.stdin:
            if (line.lower() == "quit" or line.lower() == "exit"):  
                break
            else:
                await process_request(line)
                print(interactive_prompt, end="", flush=True)

                