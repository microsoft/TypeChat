type Order = {
  items: OrderItem[];
}

type OrderItem = Pizza | Beer | Salad;

type Pizza = {
  type: "pizza";
  size: PizzaSize; // default is "large"
  toppings: PizzaTopping[];
}

type PizzaSize = "small" | "medium" | "large" | "extra large";

type PizzaTopping = "pepperoni" | "sausage" | "mushrooms" | "basil" | "extra cheese" | "extra sauce" | "anchovies" | "pineapple" | "olives" | "arugula" | "Canadian bacon";

type Beer = {
  type: "beer";
  kind: BeerKind;
  quantity?: number; // default is 1
}

type BeerKind = "Sierra Nevada Pale Ale" | "Mack & Jacks";

type Salad = {
  type: "salad";
  size: SaladSize; // default is "half"
  style: SaladStyle; // default is "Garden"
  // an array of ingredients to be removed from the salad
  removed?: SaladRemoved[]; // optional, default is []
}

type SaladSize = "whole" | "half";

type SaladStyle = "Garden" | "Greek";

type SaladRemoved = "red onions" | "croutons";
