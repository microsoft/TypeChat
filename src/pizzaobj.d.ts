type PizzaSize =
    | "small" 
    | "medium" 
    | "large" 
    | "extra large"
    ;

type PizzaTopping =
    | "pepperoni"
    | "sausage"
    | "mushrooms"
    | "basil"
    | "extraCheese"
    | "extraSauce"
    | "anchovies"
    | "pineapple"
    | "olives"
    | "arugula"
    | "Canadian bacon"
    ;

type SaladIngredient =
    | "lettuce"
    | "tomatoes"
    | "red onions"
    | "olives"
    | "peppers"
    | "parmesan"
    ;

type Pizza = {
    itemType: "pizza";
    // default: large
    size: PizzaSize;
    // toppings that are added to the pizza
    addedToppings: PizzaTopping[];
    // toppings that are removed from the pizza
    removedToppings: PizzaTopping[];   
};

type BeerKind =
    | "Mack and Jacks"
    | "Sierra Nevada Pale Ale"
    ;

type Beer = {
    itemType: "beer";
    kind: BeerKind;
    // default: 1
    quantity?: number;
};

type SaladSize =
    | "half"
    | "whole"
    ;

type SaladStyle =
    | "Garden"
    | "Greek"
    ;

type Salad = {
    itemType: "salad";
    // default: half
    size: SaladSize;
    // default: garden
    style: SaladStyle;
    // ingredients that are added to the salad
    addedIngredients: SaladIngredient[];
    // ingredients that are removed from the salad
    removedIngredients: SaladIngredient[];   
};

type OrderItem = Pizza | Beer | Salad;

// an order from a restaurant that serves pizza, beer, and salad
type Order = {
    items: OrderItem[];
}
