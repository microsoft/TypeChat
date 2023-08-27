// The following is a schema definition for creating invoices for a soccer shop.

export interface Invoice {
    client: Client;
    // date (example: March 22, 2024)
    date: DateTime;
    items: (LineItem | UnknownText)[];
}

// Use this type for items that match nothing else
export interface UnknownText {
    type: 'unknown',
    text: string; // The text that wasn't understood
}

export interface LineItem {
    type: 'lineitem',
    product: Product;
    quantity: number;
    price: number;
}

// This can be a DB lookup
export type Product = Shoes | Jerseys | Accessories;

export interface Shoes {
    type: 'Shoes';
    name: 'nike' | 'adidas' | 'puma' | 'mizuno';
    optionSize?: number;
}

export interface Jerseys {
    type: 'Jerseys';
    name: 'miami' | 'italy' | 'spain'| 'brazil'| 'manchester united'| 'manchester city'| 'liverpool'| 'arsenal';
    optionSize?: 'small' | 'medium' | 'large' | 'xlarge';
}

export interface Accessories {
    type: 'Accessories';
    name: 'ball' | 'bag' | 'door' | 'flag' | 'socks';
}

export interface Client {
    type: 'Client';
    name: string
}

export type OptionQuantity = 'no' | 'light' | 'regular' | 'extra' | number;

export interface DateTime {
    type: 'DateTime';
    date?: Date;
}
