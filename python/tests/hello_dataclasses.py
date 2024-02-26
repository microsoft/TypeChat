
from typing import Annotated

from dataclasses import dataclass, field

@dataclass
class Options:
    """
    TODO: someone add something here.
    """
    ...

@dataclass
class Response:
    attr_1: str
    attr_2: Annotated[int, "Hello!"]
    attr_3: str | None
    attr_4: str = "hello!"
    attr_5: str | None = None
    attr_6: list[str] = field(default_factory=list)
    attr_7: Options = field(default_factory=Options)
    _underscore_attr_1: int = 123

    def do_something(self):
        print(f"{self.attr_1=}")
