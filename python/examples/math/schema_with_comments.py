from typing_extensions import TypedDict, Annotated, Callable, Doc

class MathAPI(TypedDict):
    """
    This is API for a simple calculator
    """

    # this is a comment

    add: Callable[[float, float], float] # Add two numbers
    sub: Callable[[float, float], float] # Subtract two numbers
    mul: Callable[[float, float], float] # Multiply two numbers
    div: Callable[[float, float], float] # Divide two numbers
    neg: Callable[[float], float] # Negate a number
    id: Callable[[float], float] # Identity function
    unknown: Callable[[str], float] # Unknown request