from typing import Annotated, Literal, NotRequired, Optional, Required, Self, TypedDict

from typechat import python_type_to_typescript_schema


class C[T](TypedDict):
    "This is a generic class named C."
    x: NotRequired[T]
    c: "C[int | float | None]"


type IndirectC = C[int]


class D(C[str], total=False):
    "This is the definition of the class D."
    tag: Literal["D"]
    y: Required[Annotated[bool | None, "'y' is annotated with a string."]]
    z: Optional[list[int]]
    other: IndirectC
    non_class: "nonclass"


nonclass = TypedDict("NonClass", {
    "a": int,
    "my-dict": dict[str, int]
})


class E(C[str]):
    "This is the definition of the class E."
    tag: Literal["E"]
    next: Self | None


type D_or_E = D | E


result = python_type_to_typescript_schema(D_or_E)

print("// Entry point is: '{result.typescript_type_reference}'")
print("// TypeScript Schema:\n")
print(result.typescript_schema_str)
if result.errors:
    print("// Errors:")
    for err in result.errors:
        print(f"// - {err}\n")
