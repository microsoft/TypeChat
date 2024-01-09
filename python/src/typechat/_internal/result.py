from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T", covariant=True)

@dataclass
class Success(Generic[T]):
    value: T


@dataclass
class Failure:
    message: str


Result = Success[T] | Failure
