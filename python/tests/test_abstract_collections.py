import collections.abc
from typing import Any, TypedDict

from typechat import python_type_to_typescript_schema
from .utilities import TypeScriptSchemaSnapshotExtension


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

    iterable: collections.abc.Iterable[str]
    collection: collections.abc.Collection[str]


def test_abstract_collections(snapshot: Any):
    assert python_type_to_typescript_schema(MyType) == snapshot(extension_class=TypeScriptSchemaSnapshotExtension)
