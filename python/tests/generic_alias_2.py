from typing import Literal, TypedDict, Generic, TypeVar

from typechat import python_type_to_typescript_schema
from typing_extensions import TypeAliasType

T = TypeVar("T", covariant=True)


class First(Generic[T], TypedDict):
    kind: Literal["first"]
    first_attr: T


class Second(Generic[T], TypedDict):
    kind: Literal["second"]
    second_attr: T


FirstOrSecond = TypeAliasType("FirstOrSecond", First[T] | Second[T], type_params=(T,))


class Nested(TypedDict):
    item: FirstOrSecond[str]

