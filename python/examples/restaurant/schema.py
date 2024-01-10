from typing_extensions import Literal, Required, NotRequired, TypedDict, Annotated, Doc


class UnknownText(TypedDict):
    """
    Use this type for order items that match nothing else
    """

    itemType: Literal["UnknownText"]
    text: Annotated[str, "The text that wasn't understood"]


class Pizza(TypedDict, total=False):
    itemType: Required[Literal["Pizza"]]
    size: Annotated[Literal["small", "medium", "large", "extra large"], "default: large"]
    addedToppings: Annotated[list[str], Doc("toppings requested (examples: pepperoni, arugula)")]
    removedToppings: Annotated[list[str], Doc("toppings requested to be removed (examples: fresh garlic, anchovies)")]
    quantity: Annotated[int, "default: 1"]
    name: Annotated[
        Literal["Hawaiian", "Yeti", "Pig In a Forest", "Cherry Bomb"],
        Doc("used if the requester references a pizza by name"),
    ]


class Beer(TypedDict):
    itemType: Literal["Beer"]
    kind: Annotated[str, Doc("examples: Mack and Jacks, Sierra Nevada Pale Ale, Miller Lite")]
    quantity: NotRequired[Annotated[int, "default: 1"]]


SaladSize = Literal["half", "whole"]

SaladStyle = Literal["Garden", "Greek"]


class Salad(TypedDict, total=False):
    itemType: Required[Literal["Salad"]]
    portion: Annotated[str, "default: half"]
    style: Annotated[str, "default: Garden"]
    addedIngredients: Annotated[list[str], Doc("ingredients requested (examples: parmesan, croutons)")]
    removedIngredients: Annotated[list[str], Doc("ingredients requested to be removed (example: red onions)")]
    quantity: Annotated[int, "default: 1"]


OrderItem = Pizza | Beer | Salad


class Order(TypedDict):
    items: list[OrderItem | UnknownText]
