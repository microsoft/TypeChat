from typing import Literal, NotRequired, TypedDict, Annotated
def Doc(s: str) -> str: return s


class UnknownText(TypedDict):
    """
    Use this type for order items that match nothing else
    """

    itemType: Literal["UnknownText"]
    text: Annotated[str, "The text that wasn't understood"]


class Pizza(TypedDict):
    itemType: Literal["Pizza"]
    size: NotRequired[Annotated[Literal["small", "medium", "large", "extra large"], "default: large"]]
    addedToppings: NotRequired[Annotated[list[str], Doc("toppings requested (examples: pepperoni, arugula)")]]
    removedToppings: NotRequired[
        Annotated[list[str], Doc("toppings requested to be removed (examples: fresh garlic, anchovies)")]
    ]
    quantity: NotRequired[Annotated[int, "default: 1"]]
    name: NotRequired[
        Annotated[
            Literal["Hawaiian", "Yeti", "Pig In a Forest", "Cherry Bomb"],
            Doc("used if the requester references a pizza by name"),
        ]
    ]


class Beer(TypedDict):
    itemType: Literal["Beer"]
    kind: Annotated[str, Doc("examples: Mack and Jacks, Sierra Nevada Pale Ale, Miller Lite")]
    quantity: NotRequired[Annotated[int, "default: 1"]]


SaladSize = Literal["half", "whole"]

SaladStyle = Literal["Garden", "Greek"]


class Salad(TypedDict):
    itemType: Literal["Salad"]
    portion: NotRequired[Annotated[str, "default: half"]]
    style: NotRequired[Annotated[str, "default: Garden"]]
    addedIngredients: NotRequired[Annotated[list[str], Doc("ingredients requested (examples: parmesan, croutons)")]]
    removedIngredients: NotRequired[Annotated[list[str], Doc("ingredients requested to be removed (example: red onions)")]]
    quantity: NotRequired[Annotated[int, "default: 1"]]


OrderItem = Pizza | Beer | Salad


class Order(TypedDict):
    items: list[OrderItem | UnknownText]
