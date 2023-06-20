// an order from a restaurant that serves pizza, beer, and salad
export type Order = {
    items: (OrderItem | UnknownText)[];
};

export type OrderItem = Pizza | Beer | Salad | NamedPizza;

// Use this type for order items that match nothing else
export interface UnknownText {
    itemType: 'unknown',
    text: string; // The text that wasn't understood
}


export type Pizza = {
    itemType: 'pizza';
    // default: large
    size?: 'small' | 'medium' | 'large' | 'extra large';
    // toppings requested (examples: pepperoni, arugula)
    addedToppings?: string[];
    // toppings requested to be removed (examples: fresh garlic, anchovies)
    removedToppings?: string[];
    // default: 1
    quantity?: number;
    // used if the requester references a pizza by name
    name?: "Hawaiian" | "Yeti" | "Pig In a Forest" | "Cherry Bomb";
};

export interface NamedPizza extends Pizza {
}

export type Beer = {
    itemType: 'beer';
    // examples: Mack and Jacks, Sierra Nevada Pale Ale, Miller Lite
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
    // default: Garden
    style?: string;
    // ingredients requested (examples: parmesan, croutons)
    addedIngredients?: string[];
    // ingredients requested to be removed (example: red onions)
    removedIngredients?: string[];
    // default: 1
    quantity?: number;
};

