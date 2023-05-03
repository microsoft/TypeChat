export const pizzaSizes = ['small', 'medium', 'large', 'extra large'];

export const saladIngredients = [
    'lettuce',
    'tomatoes',
    'red onions',
    'olives',
    'peppers',
    'parmesan',
    'croutons',
];

export const pizzaToppings = [
    'pepperoni',
    'sausage',
    'mushrooms',
    'basil',
    'extra cheese',
    'extra sauce',
    'anchovies',
    'pineapple',
    'olives',
    'arugula',
    'Canadian bacon',
];

export type Pizza = {
    itemType: 'pizza';
    // default: large
    size?: string;
    // an array of strings from the pizzaToppings array
    addedToppings?: string[];
    removedToppings?: string[];
    // default: 1
    quantity?: number;
};

export const beerKind = ['Mack and Jacks', 'Sierra Nevada Pale Ale'];

export type Beer = {
    itemType: 'beer';
    // must be one of the strings in the beerKind array
    kind: string;
    // default: 1
    quantity?: number;
};

export const saladSize = ['half', 'whole'];

export const saladStyle = ['Garden', 'Greek'];

export type Salad = {
    itemType: 'salad';
    // default: half
    portion?: string;
    // default: garden
    style?: string;
    // an array of strings from the saladIngredients array
    addedIngredients?: string[];
    removedIngredients?: string[];
    // default: 1
    quantity?: number;
};

export type OrderItem = Pizza | Beer | Salad;

// an order from a restaurant that serves pizza, beer, and salad
export type Order = {
    items: OrderItem[];
};
