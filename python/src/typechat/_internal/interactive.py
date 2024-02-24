import sys
from typing import Callable, Awaitable

async def process_requests(interactive_prompt: str, input_file_name: str | None, process_request: Callable[[str], Awaitable[None]]):
    """
    A request processor for interactive input or input from a text file. If an input file name is specified,
    the callback function is invoked for each line in file. Otherwise, the callback function is invoked for
    each line of interactive input until the user types "quit" or "exit".
    
    Args:
        interactive_prompt: Prompt to present to user.
        input_file_name: Input text file name, if any.
        process_request: Async callback function that is invoked for each interactive input or each line in text file.
    """
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
            lower_line = line.lower().strip()
            if lower_line == "quit" or lower_line == "exit":
                break
            else:
                await process_request(line)
                print(interactive_prompt, end="", flush=True)

                