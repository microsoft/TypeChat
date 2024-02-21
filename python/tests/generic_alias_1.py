from typing import Literal, TypedDict, TypeVar, Generic
from typing_extensions import TypeAliasType

from typechat import python_type_to_typescript_schema

T = TypeVar("T", covariant=True)


class First(Generic[T], TypedDict):
    kind: Literal["first"]
    first_attr: T


class Second(Generic[T], TypedDict):
    kind: Literal["second"]
    second_attr: T


FirstOrSecond = TypeAliasType("FirstOrSecond", First[T] | Second[T], type_params=(T,))
