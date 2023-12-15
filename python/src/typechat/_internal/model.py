
from typing import Protocol

from typechat._internal.result import Result


class TypeChatModel(Protocol):
    def complete(self, input: str) -> Result[str]:
        ...
