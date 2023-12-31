from typing import List, Literal, NotRequired, TypeAlias, TypedDict, Union

from typechat import python_type_to_typescript_schema

# This version of coffeeshop uses older constructs for
# types like List and Union. It is included here for
# testing purposes.

class UnknownText(TypedDict):
    """
    Represents any text that could not be understood.
    """

    type: Literal["UnknownText"]
    text: str


class Caffeine(TypedDict):
    type: Literal["Caffeine"]
    name: Literal["regular", "two thirds caf", "half caf", "one third caf", "decaf"]


class Milk(TypedDict):
    type: Literal["Milk"]
    name: Literal[
        "whole milk", "two percent milk", "nonfat milk", "coconut milk", "soy milk", "almond milk", "oat milk"
    ]


class Creamer(TypedDict):
    type: Literal["Creamer"]
    name: Literal[
        "whole milk creamer",
        "two percent milk creamer",
        "one percent milk creamer",
        "nonfat milk creamer",
        "coconut milk creamer",
        "soy milk creamer",
        "almond milk creamer",
        "oat milk creamer",
        "half and half",
        "heavy cream",
    ]


class Topping(TypedDict):
    type: Literal["Topping"]
    name: Literal["cinnamon", "foam", "ice", "nutmeg", "whipped cream", "water"]
    optionQuantity: NotRequired["OptionQuantity"]


class LattePreparation(TypedDict):
    type: Literal["LattePreparation"]
    name: Literal["for here cup", "lid", "with room", "to go", "dry", "wet"]


class Sweetener(TypedDict):
    type: Literal["Sweetener"]
    name: Literal["equal", "honey", "splenda", "sugar", "sugar in the raw", "sweet n low", "espresso shot"]
    optionQuantity: NotRequired["OptionQuantity"]


CaffeineOptions = Union[Caffeine, Milk, Creamer]

LatteOptions = Union[CaffeineOptions, Topping, LattePreparation, Sweetener]

CoffeeTemperature: TypeAlias = Literal["hot", "extra hot", "warm", "iced"]

CoffeeSize: TypeAlias = Literal["short", "tall", "grande", "venti"]

EspressoSize: TypeAlias = Literal["solo", "doppio", "triple", "quad"]

OptionQuantity: TypeAlias = Literal["no", "light", "regular", "extra"]


class Syrup(TypedDict):
    type: Literal["Syrup"]
    name: Literal[
        "almond syrup",
        "buttered rum syrup",
        "caramel syrup",
        "cinnamon syrup",
        "hazelnut syrup",
        "orange syrup",
        "peppermint syrup",
        "raspberry syrup",
        "toffee syrup",
        "vanilla syrup",
    ]
    optionQuantity: NotRequired[OptionQuantity]


class LatteDrink(TypedDict):
    type: Literal["LatteDrink"]
    name: Literal["cappuccino", "flat white", "latte", "latte macchiato", "mocha", "chai latte"]
    temperature: NotRequired["CoffeeTemperature"]
    size: NotRequired["CoffeeSize"]  # The default is 'grande'
    options: NotRequired[List[Union[Creamer, Sweetener, Syrup, Topping, Caffeine, LattePreparation]]]


class EspressoDrink(TypedDict):
    type: Literal["EspressoDrink"]
    name: Literal["espresso", "lungo", "ristretto", "macchiato"]
    temperature: NotRequired["CoffeeTemperature"]
    size: NotRequired["EspressoSize"]  # The default is 'doppio'
    options: NotRequired[List[Union[Creamer, Sweetener, Syrup, Topping, Caffeine, LattePreparation]]]


class CoffeeDrink(TypedDict):
    type: Literal["CoffeeDrink"]
    name: Literal["americano", "coffee"]
    temperature: NotRequired[CoffeeTemperature]
    size: NotRequired[CoffeeSize]  # The default is "grande"
    options: NotRequired[List[Union[Creamer, Sweetener, Syrup, Topping, Caffeine, LattePreparation]]]


class BakeryOption(TypedDict):
    type: Literal["BakeryOption"]
    name: Literal["butter", "strawberry jam", "cream cheese"]
    optionQuantity: NotRequired["OptionQuantity"]


class BakeryPreparation(TypedDict):
    type: Literal["BakeryPreparation"]
    name: Literal["warmed", "cut in half"]


class BakeryProduct(TypedDict):
    type: Literal["BakeryProduct"]
    name: Literal["apple bran muffin", "blueberry muffin", "lemon poppyseed muffin", "bagel"]
    options: NotRequired[List[BakeryOption | BakeryPreparation]]


Product = Union[BakeryProduct, LatteDrink, CoffeeDrink, UnknownText]


class LineItem(TypedDict):
    type: Literal["LineItem"]
    product: Product
    quantity: int


class Cart(TypedDict):
    type: Literal["Cart"]
    items: List[LineItem | UnknownText]

result = python_type_to_typescript_schema(Cart)

print("// Entry point is: '{result.typescript_type_reference}'")
print("// TypeScript Schema:\n")
print(result.typescript_schema_str)
if result.errors:
    print("// Errors:")
    for err in result.errors:
        print(f"// - {err}\n")
