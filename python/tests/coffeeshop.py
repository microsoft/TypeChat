from typing import Literal, NotRequired, TypedDict

from typechat.py2ts import pyd_to_ts
from typechat.ts2str import ts_declaration_to_str


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


CaffeineOptions = Caffeine | Milk | Creamer

LatteOptions = CaffeineOptions | Topping | LattePreparation | Sweetener

CoffeeTemperature = Literal["hot", "extra hot", "warm", "iced"]

CoffeeSize = Literal["short", "tall", "grande", "venti"]

EspressoSize = Literal["solo", "doppio", "triple", "quad"]

OptionQuantity = Literal["no", "light", "regular", "extra"]


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
    options: NotRequired[list[Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation]]


class EspressoDrink(TypedDict):
    type: Literal["EspressoDrink"]
    name: Literal["espresso", "lungo", "ristretto", "macchiato"]
    temperature: NotRequired["CoffeeTemperature"]
    size: NotRequired["EspressoSize"]  # The default is 'doppio'
    options: NotRequired[list[Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation]]


class CoffeeDrink(TypedDict):
    type: Literal["CoffeeDrink"]
    name: Literal["americano", "coffee"]
    temperature: NotRequired[CoffeeTemperature]
    size: NotRequired[CoffeeSize]  # The default is "grande"
    options: NotRequired[list[Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation]]


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
    options: NotRequired[list[BakeryOption | BakeryPreparation]]


Product = BakeryProduct | LatteDrink | CoffeeDrink | UnknownText


class LineItem(TypedDict):
    type: Literal["LineItem"]
    product: Product
    quantity: int


class Cart(TypedDict):
    type: Literal["Cart"]
    items: list[LineItem | UnknownText]

result = pyd_to_ts(Cart)

ts_nodes = result.type_declarations
errs = result.errors

ss = [ts_declaration_to_str(node) for node in ts_nodes]
for s in ss:
    print(s)

if errs:
    print("// Errors:")
    for err in errs:
        print(f"// - {err}\n")
