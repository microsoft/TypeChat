// The possible pizza sizes
export const pizzaSizes = ['small', 'medium', 'large', 'extra large'];

// The possible pizza toppings
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

// The possible salad sizes
export const saladSizes = ['whole', 'half'];

// The possible salad styles
export const saladStyles = ['Garden', 'Greek'];

// The possible salad ingredients that can be removed
export const saladRemovedIngredients = ['red onions', 'croutons'];

// The possible kinds of beer
export const beerKinds = ['Sierra Nevada Pale Ale', 'Mack & Jacks'];

// The type for a pizza item
export type Pizza = {
    type: 'pizza';
    quantity?: number; // default is 1
    size?: string; // default is "large", must be one of pizzaSizes
    toppings?: string[]; // each string must be one of pizzaToppings
};

// The type for a beer item
export type Beer = {
    type: 'beer';
    quantity?: number; // default is 1
    kind: string; // must be one of beerKinds
};

// The type for a salad item
export type Salad = {
    type: 'salad';
    quantity?: number; // default is 1
    size?: string; // default is "half", must be one of saladSizes
    style?: string; // default is "Garden", must be one of saladStyles
    removedIngredients?: string[]; // each string must be one of saladRemovedIngredients
};

// The type for an order item, which is a union of the three item types
export type OrderItem = Pizza | Beer | Salad;

// The type for an order, which is an array of order items
export type Order = {
    items: OrderItem[];
};
