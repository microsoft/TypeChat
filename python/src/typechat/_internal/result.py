from dataclasses import dataclass, field
from enum import Enum
from typing_extensions import Generic, TypeAlias, TypeVar

T = TypeVar("T", covariant=True)

class _MissingValue(Enum):
    MISSING = 0

@dataclass
class Success(Generic[T]):
    "An object representing a successful operation with a result of type `T`."
    value: T


@dataclass
class Failure:
    """
    An operation that failed for the reason given in `message`.

    `value` is unvalidated and is available only when `has_value` is true. `response_text` contains
    the latest model response, when available. If a repair response couldn't be parsed, `value`
    may refer to a rejected candidate from an earlier attempt.
    """
    message: str
    value: object = field(default=_MissingValue.MISSING, kw_only=True, repr=False)
    response_text: str | None = field(default=None, kw_only=True, repr=False)

    @property
    def has_value(self) -> bool:
        """Distinguishes missing data from an explicitly supplied value, including `None`."""
        return self.value is not _MissingValue.MISSING


"""
An object representing a successful or failed operation of type `T`.
"""
Result: TypeAlias = Success[T] | Failure
