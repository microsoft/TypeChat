from typing import Protocol, runtime_checkable


@runtime_checkable
class MathAPI(Protocol):
    """
    This is API for a simple calculator
    """

    def add(self, x: float, y: float) -> float:
        """
        Add two numbers
        """
        ...

    def sub(self, x: float, y: float) -> float:
        """
        Subtract two numbers
        """
        ...

    def mul(self, x: float, y: float) -> float:
        """
        Multiply two numbers
        """
        ...

    def div(self, x: float, y: float) -> float:
        """
        Divide two numbers
        """
        ...

    def neg(self, x: float) -> float:
        """
        Negate a number
        """
        ...

    def id(self, x: float, y: float) -> float:
        """
        Identity function
        """
        ...

    def unknown(self, text: str) -> float:
        """
        unknown request
        """
        ...
