from dataclasses import dataclass
from typing_extensions import Generic, TypeAlias, TypeVar

T = TypeVar("T", covariant=True)

@dataclass
class Success(Generic[T]):
    "An object representing a successful operation with a result of type `T`."
    value: T


@dataclass
class Failure:
    "An object representing an operation that failed for the reason given in `message`."
    message: str


"""
An object representing a successful or failed operation of type `T`.
"""
Result: TypeAlias = Success[T] | Failure
