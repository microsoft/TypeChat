from typing_extensions import Literal, NotRequired, TypedDict, Annotated, Doc


class UnknownText(TypedDict):
    """
    Use this type for order items that match nothing else
    """

    type: Literal["Unknown"]
    text: Annotated[str, Doc("The text that wasn't understood")]


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

OptionQuantity = Literal["no", "light", "regular", "extra"] | int


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
    size: NotRequired[Annotated[CoffeeSize, Doc("The default is 'grande'")]]
    options: NotRequired[list[Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation]]


class EspressoDrink(TypedDict):
    type: Literal["EspressoDrink"]
    name: Literal["espresso", "lungo", "ristretto", "macchiato"]
    temperature: NotRequired["CoffeeTemperature"]
    size: NotRequired[Annotated["EspressoSize", Doc("The default is 'doppio'")]]
    options: NotRequired[list[Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation]]


class CoffeeDrink(TypedDict):
    type: Literal["CoffeeDrink"]
    name: Literal["americano", "coffee"]
    temperature: NotRequired[CoffeeTemperature]
    size: NotRequired[Annotated[CoffeeSize, Doc("The default is 'grande'")]]
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
    options: list[BakeryOption | BakeryPreparation]


Product = BakeryProduct | LatteDrink | EspressoDrink | CoffeeDrink | UnknownText


class LineItem(TypedDict):
    type: Literal["LineItem"]
    product: Product
    quantity: int


class Cart(TypedDict):
    type: Literal["Cart"]
    items: list[LineItem | UnknownText]