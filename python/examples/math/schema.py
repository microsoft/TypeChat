from typing_extensions import TypedDict, Annotated, Callable, Doc


class MathAPI(TypedDict):
    """
    This is API for a simple calculator
    """

    add: Annotated[Callable[[float, float], float], Doc("Add two numbers")]
    sub: Annotated[Callable[[float, float], float], Doc("Subtract two numbers")]
    mul: Annotated[Callable[[float, float], float], Doc("Multiply two numbers")]
    div: Annotated[Callable[[float, float], float], Doc("Divide two numbers")]
    neg: Annotated[Callable[[float], float], Doc("Negate a number")]
    id: Annotated[Callable[[float], float], Doc("Identity function")]
    unknown: Annotated[Callable[[str], float], Doc("Unknown request")]
