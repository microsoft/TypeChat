// Entry point is: 'Cart'

interface Cart {
    type: "Cart";
    items: Array<LineItem | UnknownText>;
}

// Represents any text that could not be understood.
interface UnknownText {
    type: "UnknownText";
    // The text that wasn't understood
    text: string;
}

interface LineItem {
    type: "LineItem";
    product: BakeryProduct | LatteDrink | CoffeeDrink | EspressoDrink | UnknownText;
    quantity: number;
}

interface EspressoDrink {
    type: "EspressoDrink";
    name: "espresso" | "lungo" | "ristretto" | "macchiato";
    temperature?: "hot" | "extra hot" | "warm" | "iced";
    // The default is 'doppio'
    size?: "solo" | "doppio" | "triple" | "quad";
    options?: Array<Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation>;
}

interface LattePreparation {
    type: "LattePreparation";
    name: "for here cup" | "lid" | "with room" | "to go" | "dry" | "wet";
}

interface Caffeine {
    type: "Caffeine";
    name: "regular" | "two thirds caf" | "half caf" | "one third caf" | "decaf";
}

interface Topping {
    type: "Topping";
    name: "cinnamon" | "foam" | "ice" | "nutmeg" | "whipped cream" | "water";
    optionQuantity?: "no" | "light" | "regular" | "extra";
}

interface Syrup {
    type: "Syrup";
    name: "almond syrup" | "buttered rum syrup" | "caramel syrup" | "cinnamon syrup" | "hazelnut syrup" | "orange syrup" | "peppermint syrup" | "raspberry syrup" | "toffee syrup" | "vanilla syrup";
    optionQuantity?: "no" | "light" | "regular" | "extra";
}

interface Sweetener {
    type: "Sweetener";
    name: "equal" | "honey" | "splenda" | "sugar" | "sugar in the raw" | "sweet n low" | "espresso shot";
    optionQuantity?: "no" | "light" | "regular" | "extra";
}

interface Creamer {
    type: "Creamer";
    name: "whole milk creamer" | "two percent milk creamer" | "one percent milk creamer" | "nonfat milk creamer" | "coconut milk creamer" | "soy milk creamer" | "almond milk creamer" | "oat milk creamer" | "half and half" | "heavy cream";
}

interface CoffeeDrink {
    type: "CoffeeDrink";
    name: "americano" | "coffee";
    temperature?: "hot" | "extra hot" | "warm" | "iced";
    // The default is 'grande'
    size?: "short" | "tall" | "grande" | "venti";
    options?: Array<Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation>;
}

interface LatteDrink {
    type: "LatteDrink";
    name: "cappuccino" | "flat white" | "latte" | "latte macchiato" | "mocha" | "chai latte";
    temperature?: "hot" | "extra hot" | "warm" | "iced";
    // The default is 'grande'
    size?: "short" | "tall" | "grande" | "venti";
    options?: Array<Creamer | Sweetener | Syrup | Topping | Caffeine | LattePreparation>;
}

interface BakeryProduct {
    type: "BakeryProduct";
    name: "apple bran muffin" | "blueberry muffin" | "lemon poppyseed muffin" | "bagel";
    options?: Array<BakeryOption | BakeryPreparation>;
}

interface BakeryPreparation {
    type: "BakeryPreparation";
    name: "warmed" | "cut in half";
}

interface BakeryOption {
    type: "BakeryOption";
    name: "butter" | "strawberry jam" | "cream cheese";
    optionQuantity?: "no" | "light" | "regular" | "extra";
}
