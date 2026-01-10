from typing_extensions import Literal, Required, NotRequired, TypedDict


class UnknownText(TypedDict):
    """
    Use this type for order items that match nothing else
    """

    itemType: Literal["Unknown"]
    text: str # The text that wasn't understood


class Pizza(TypedDict, total=False):
    itemType: Required[Literal["Pizza"]]
    size: Literal["small", "medium", "large", "extra large"] # default: large
    addedToppings: list[str] # toppings requested (examples: pepperoni, arugula
    removedToppings: list[str] # toppings requested to be removed (examples: fresh garlic, anchovies
    quantity: int # default: 1
    name: Literal["Hawaiian", "Yeti", "Pig In a Forest", "Cherry Bomb"] # used if the requester references a pizza by name


class Beer(TypedDict):
    itemType: Literal["Beer"]
    kind: str # examples: Mack and Jacks, Sierra Nevada Pale Ale, Miller Lite
    quantity: NotRequired[int] # default: 1


SaladSize = Literal["half", "whole"]

SaladStyle = Literal["Garden", "Greek"]


class Salad(TypedDict, total=False):
    itemType: Required[Literal["Salad"]]
    portion: str # default: half
    style: str # default: Garden
    addedIngredients: list[str] # ingredients requested (examples: parmesan, croutons)
    removedIngredients: list[str] # ingredients requested to be removed (example: red onions)
    quantity: int # default: 1


OrderItem = Pizza | Beer | Salad


class Order(TypedDict):
    items: list[OrderItem | UnknownText]
