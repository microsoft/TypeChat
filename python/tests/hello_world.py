from typing import Annotated, Literal, NotRequired, Optional, Required, Self, TypedDict

from typechat.py2ts import pyd_to_ts
from typechat.ts2str import ts_declaration_to_str


class C[T](TypedDict):
    "This is a generic class named C."
    x: NotRequired[T]
    c: "C[int | float | None]"


type IndirectC = C[int]


class D(C[str], total=False):
    "This is the definition of the class D."
    tag: Literal["D"]
    y: Required[Annotated[bool | None, "This is a string."]]
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


# ^ Python input
result = pyd_to_ts(D_or_E)

ts_nodes = result.type_declarations
errs = result.errors

ss = [ts_declaration_to_str(node) for node in ts_nodes]
for s in ss:
    print(s)

if errs:
    print("// Errors:")
    for err in errs:
        print(f"// - {err}\n")
