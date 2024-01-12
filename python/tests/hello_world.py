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
    y: Required[Annotated[bool | None, "This comes from string metadata\nwithin an Annotated hint."]]
    z: Optional[list[int]]
    other: IndirectC
    non_class: "nonclass"

    multiple_metadata: Annotated[str, None, str, "This comes from later metadata.", int]

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

print(f"// Entry point is: '{result.typescript_type_reference}'")
print("// TypeScript Schema:\n")
print(result.typescript_schema_str)
if result.errors:
    print("// Errors:")
    for err in result.errors:
        print(f"// - {err}\n")
