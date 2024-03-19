
from dataclasses import dataclass
import typechat

@dataclass
class Example:
    a: str
    b: int
    c: bool

v = typechat.TypeChatValidator(Example)

def test_dict_valid_as_dataclass():
    r = v.validate_object({"a": "hello!", "b": 42, "c": True})
    assert r == typechat.Success(Example(a="hello!", b=42, c=True))
    