import { z } from "zod";

export const OptionQuantity = z.union([z.literal('no'), z.literal('light'), z.literal('regular'), z.literal('extra'), z.number()]);

export const BakeryOptions = z.object({
    type: z.literal('BakeryOptions'),
    name: z.enum(['butter', 'strawberry jam', 'cream cheese']),
    optionQuantity: OptionQuantity.optional()
});

export const BakeryPreparations = z.object({
    type: z.literal('BakeryPreparations'),
    name: z.enum(['warmed', 'cut in half'])
});

export const BakeryProducts = z.object({
    type: z.literal('BakeryProducts'),
    name: z.enum(['apple bran muffin', 'blueberry muffin', 'lemon poppyseed muffin', 'bagel']),
    options: z.discriminatedUnion("type", [BakeryOptions, BakeryPreparations]).array()
})

export const CoffeeTemperature = z.enum(['hot', 'extra hot', 'warm', 'iced']);

export const CoffeeSize = z.enum(['short', 'tall', 'grande', 'venti']);

export const Milks = z.object({
    type: z.literal('Milks'),
    name: z.enum(['whole milk', 'two percent milk', 'nonfat milk', 'coconut milk', 'soy milk', 'almond milk', 'oat milk'])
})

export const Sweeteners = z.object({
    type: z.literal('Sweeteners'),
    name: z.enum(['equal', 'honey', 'splenda', 'sugar', 'sugar in the raw', 'sweet n low', 'espresso shot']),
    optionQuantity: OptionQuantity.optional()
});

export const Syrups = z.object({
    type: z.literal('Syrups'),
    name: z.enum(['almond syrup', 'buttered rum syrup', 'caramel syrup', 'cinnamon syrup', 'hazelnut syrup',
        'orange syrup', 'peppermint syrup', 'raspberry syrup', 'toffee syrup', 'vanilla syrup']),
    optionQuantity: OptionQuantity.optional()
});

export const Toppings = z.object({
    type: z.literal('Toppings'),
    name: z.enum(['cinnamon', 'foam', 'ice', 'nutmeg', 'whipped cream', 'water']),
    optionQuantity: OptionQuantity.optional()
});

export const Caffeines = z.object({
    type: z.literal('Caffeines'),
    name: z.enum(['regular', 'two thirds caf', 'half caf', 'one third caf', 'decaf'])
});

export const LattePreparations = z.object({
    type: z.literal('LattePreparations'),
    name: z.enum(['for here cup', 'lid', 'with room', 'to go', 'dry', 'wet'])
});

export const LatteDrinks = z.object({
    type: z.literal('LatteDrinks'),
    name: z.enum(['cappuccino', 'flat white', 'latte', 'latte macchiato', 'mocha', 'chai latte']),
    temperature: CoffeeTemperature.optional(),
    size: CoffeeSize.describe("The default is 'grande'"),
    options: z.discriminatedUnion("type", [Milks, Sweeteners, Syrups, Toppings, Caffeines, LattePreparations]).array().optional(),
});

export const EspressoSize = z.enum(['solo', 'doppio', 'triple', 'quad']);

export const Creamers = z.object({
    type: z.literal('Creamers'),
    name: z.enum(['whole milk creamer', 'two percent milk creamer', 'one percent milk creamer', 'nonfat milk creamer',
        'coconut milk creamer', 'soy milk creamer', 'almond milk creamer', 'oat milk creamer', 'half and half', 'heavy cream'])
});

export const EspressoDrinks = z.object({
    type: z.literal('EspressoDrinks'),
    name: z.enum(['espresso', 'lungo', 'ristretto', 'macchiato']),
    temperature: CoffeeTemperature.optional(),
    size: EspressoSize.optional().describe("The default is 'doppio'"),
    options: z.discriminatedUnion("type", [Creamers, Sweeteners, Syrups, Toppings, Caffeines, LattePreparations]).array().optional()
});

export const CoffeeDrinks = z.object({
    type: z.literal('CoffeeDrinks'),
    name: z.enum(['americano', 'coffee']),
    temperature: CoffeeTemperature.optional(),
    size: CoffeeSize.optional().describe("The default is 'grande'"),
    options: z.discriminatedUnion("type", [Creamers, Sweeteners, Syrups, Toppings, Caffeines, LattePreparations]).array().optional()
});

export const Product = z.discriminatedUnion("type", [BakeryProducts, LatteDrinks, EspressoDrinks, CoffeeDrinks]);

export const LineItem = z.object({
    type: z.literal('lineitem'),
    product: Product,
    quantity: z.number()
});

export const UnknownText = z.object({
    type: z.literal('unknown'),
    text: z.string().describe("The text that wasn't understood")
});

export const Cart = z.object({
    items: z.discriminatedUnion("type", [LineItem, UnknownText]).array()
});

export const CoffeeShopSchema = {
    Cart: Cart.describe("A schema definition for ordering coffee and bakery products"),
    UnknownText: UnknownText.describe("Use this type for order items that match nothing else"),
    LineItem,
    Product,
    BakeryProducts,
    BakeryOptions,
    BakeryPreparations,
    LatteDrinks,
    EspressoDrinks,
    CoffeeDrinks,
    Syrups,
    Caffeines,
    Milks,
    Creamers,
    Toppings,
    LattePreparations,
    Sweeteners,
    CoffeeTemperature,
    CoffeeSize,
    EspressoSize,
    OptionQuantity
};
