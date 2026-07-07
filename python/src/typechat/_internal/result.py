from dataclasses import dataclass
from typing_extensions import Generic, Literal, TypeAlias, TypeVar

T = TypeVar("T", covariant=True)


@dataclass
class TokenUsage:
    """
    Normalized token usage reported by a language model for a single completion. Field values are
    mapped from the underlying API response so callers don't have to special-case the differences
    between the Chat Completions API (`prompt_tokens` / `completion_tokens`) and the Responses API
    (`input_tokens` / `output_tokens`).
    """
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cached_prompt_tokens: int | None = None
    reasoning_tokens: int | None = None


CompletionFinishReason: TypeAlias = Literal["stop", "length", "content_filter", "tool_calls", "other"]
"""
Normalized reason a completion stopped generating, mapped from the underlying API so callers can
detect conditions such as truncation (`"length"`) or filtered output (`"content_filter"`) without
special-casing each API variant. `"other"` covers any provider-specific reason that doesn't map to
one of the common values.
"""


@dataclass
class CompletionInfo:
    """
    Metadata about a successful completion. This combines what the language model API reported (token
    usage, model, finish reason, and the raw response) with TypeChat's own translation metrics (the
    number of repair attempts). It is attached to the optional `info` property of a `Success` so
    callers can inspect these details (for example, to track cost or telemetry) without changing how
    existing results are consumed.
    """
    model: str | None = None
    usage: TokenUsage | None = None
    finish_reason: CompletionFinishReason | None = None
    raw: dict[str, object] | None = None
    repair_attempts: int | None = None


@dataclass
class Success(Generic[T]):
    "An object representing a successful operation with a result of type `T`."
    value: T
    info: CompletionInfo | None = None


@dataclass
class Failure:
    "An object representing an operation that failed for the reason given in `message`."
    message: str


"""
An object representing a successful or failed operation of type `T`.
"""
Result: TypeAlias = Success[T] | Failure
