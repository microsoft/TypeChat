from typing import Annotated, Literal, NotRequired, Optional, Required, Self, TypedDict, TypeVar, Generic
from typing_extensions import TypeAliasType
from typechat import python_type_to_typescript_schema

T = TypeVar("T", covariant=True)


class C(Generic[T], TypedDict):
    "This is a generic class named C."
    x: NotRequired[T]
    c: "C[int | float | None]"


IndirectC = TypeAliasType("IndirectC", C[int])


class D(C[str], total=False):
    "This is the definition of the class D."
    tag: Literal["D"]
    y: Required[Annotated[bool | None, "This comes from string metadata\nwithin an Annotated hint."]]
    z: Optional[list[int]]
    other: IndirectC
    non_class: "nonclass"

    multiple_metadata: Annotated[str, None, str, "This comes from later metadata.", int]


nonclass = TypedDict("NonClass", {"a": int, "my-dict": dict[str, int]})


class E(C[str]):
    "This is the definition of the class E."
    tag: Literal["E"]
    next: Self | None


D_or_E = TypeAliasType("D_or_E", D | E)
