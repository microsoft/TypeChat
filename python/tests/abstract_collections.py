
from typing import TypedDict
from typechat import python_type_to_typescript_schema

import collections.abc

class MyType(TypedDict):
    built_in_dict: dict[str, str]
    built_in_set: set[str]
    built_in_frozen_set: frozenset[str]

    mapping: collections.abc.Mapping[str, str]
    mutable_mapping: collections.abc.MutableMapping[str, str]

    set: collections.abc.Set[str]
    mutable_set: collections.abc.MutableSet[str]

    sequence: collections.abc.Sequence[str]
    mutable_sequence: collections.abc.MutableSequence[str]

result = python_type_to_typescript_schema(MyType)

print(f"// Entry point is: '{result.typescript_type_reference}'")
print("// TypeScript Schema:\n")
print(result.typescript_schema_str)
if result.errors:
    print("// Errors:")
    for err in result.errors:
        print(f"// - {err}\n")
