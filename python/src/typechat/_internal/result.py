from dataclasses import dataclass
from typing_extensions import TypeAlias, TypeVar

T = TypeVar("T", covariant=True)

@dataclass
class Failure:
    "An object representing an operation that failed for the reason given in `message`."
    message: str

"""
An object representing a successful or failed operation of type `T`.
"""
Result: TypeAlias = T | Failure
