from typing import Literal, TypedDict

from typechat.py2ts import pyd_to_ts
from typechat.ts2str import ts_declaration_to_str


class First[T](TypedDict):
    kind: Literal["first"]
    first_attr: T


class Second[T](TypedDict):
    kind: Literal["second"]
    second_attr: T


type FirstOrSecond[T] = First[T] | Second[T]


class Nested(TypedDict):
    item: FirstOrSecond[str]


result = pyd_to_ts(Nested)

ts_nodes = result.type_declarations
errs = result.errors

ss = [ts_declaration_to_str(node) for node in ts_nodes]
for s in ss:
    print(s)

if errs:
    print("// Errors:")
    for err in errs:
        print(f"// - {err}\n")
