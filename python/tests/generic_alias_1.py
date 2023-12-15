from typing import Literal, TypedDict

from typechat import python_type_to_typescript_schema

class First[T](TypedDict):
    kind: Literal["first"]
    first_attr: T


class Second[T](TypedDict):
    kind: Literal["second"]
    second_attr: T


type FirstOrSecond[T] = First[T] | Second[T]

result = python_type_to_typescript_schema(FirstOrSecond)

print("// Entry point is: '{result.typescript_type_reference}'")
print("// TypeScript Schema:\n")
print(result.typescript_schema_str)
if result.errors:
    print("// Errors:")
    for err in result.errors:
        print(f"// - {err}\n")
