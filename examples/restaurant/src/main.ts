import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createLanguageModel,
  createTypeChat,
  processRequests,
} from "typechat";
import { Order } from "./foodOrderViewSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const pizza = "🍕";
const model = createLanguageModel();
const viewSchema = fs.readFileSync(
  path.join(__dirname, "../src/foodOrderViewSchema.ts"),
  "utf8"
);
const typeChat = createTypeChat<Order>(model, viewSchema, "Order");

const saladIngredients = [
  "lettuce",
  "tomatoes",
  "red onions",
  "olives",
  "peppers",
  "parmesan",
  "croutons",
];

const pizzaToppings = [
  "pepperoni",
  "sausage",
  "mushrooms",
  "basil",
  "extra cheese",
  "extra sauce",
  "anchovies",
  "pineapple",
  "olives",
  "arugula",
  "Canadian bacon",
  "Mama Lil's Peppers",
];

// a function that takes two arrays of strings a and b and removes from a and b
// all strings that are in both a and b
function removeCommonStrings(a: string[], b: string[]) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  for (const item of aSet) {
    if (bSet.has(item)) {
      aSet.delete(item);
      bSet.delete(item);
    }
  }
  return [Array.from(aSet), Array.from(bSet)];
}

const namedPizzas = new Map([
  ["Hawaiian", ["pineapple", "Canadian bacon"]],
  ["Yeti", ["extra cheese", "extra sauce"]],
  ["Pig In a Forest", ["mushrooms", "basil", "Canadian bacon", "arugula"]],
  ["Cherry Bomb", ["pepperoni", "sausage", "Mama Lil's Peppers"]],
]);

function printOrder(order: Order) {
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      if (item.itemType === "unknown") {
        break;
      }
      switch (item.itemType) {
        case "pizza": {
          if (item.name) {
            const addedToppings = namedPizzas.get(item.name);
            if (addedToppings) {
              if (item.addedToppings) {
                item.addedToppings = item.addedToppings.concat(addedToppings);
              } else {
                item.addedToppings = addedToppings;
              }
            }
          }
          if (!item.size) {
            item.size = "large";
          }
          let quantity = 1;
          if (item.quantity) {
            quantity = item.quantity;
          }
          let pizzaStr = `    ${quantity} ${item.size} pizza`;
          if (item.addedToppings && item.removedToppings) {
            [item.addedToppings, item.removedToppings] =
              removeCommonStrings(item.addedToppings, item.removedToppings);
          }
          if (item.addedToppings && item.addedToppings.length > 0) {
            pizzaStr += " with";
            for (const [index, addedTopping] of item.addedToppings.entries()) {
              if (pizzaToppings.includes(addedTopping)) {
                pizzaStr += `${index === 0 ? " " : ", "}${addedTopping}`;
              } else {
                console.log(`We are out of ${addedTopping}`);
              }
            }
          }
          if (item.removedToppings && item.removedToppings.length > 0) {
            pizzaStr += " and without";
            for (const [
              index,
              removedTopping,
            ] of item.removedToppings.entries()) {
              pizzaStr += `${index === 0 ? " " : ", "}${removedTopping}`;
            }
          }
          console.log(pizzaStr);
          break;
        }
        case "beer": {
          let quantity = 1;
          if (item.quantity) {
            quantity = item.quantity;
          }
          const beerStr = `    ${quantity} ${item.kind}`;
          console.log(beerStr);
          break;
        }
        case "salad": {
          let quantity = 1;
          if (item.quantity) {
            quantity = item.quantity;
          }
          if (!item.portion) {
            item.portion = "half";
          }
          if (!item.style) {
            item.style = "Garden";
          }
          let saladStr = `    ${quantity} ${item.portion} ${item.style} salad`;
          if (item.addedIngredients && item.removedIngredients) {
            [item.addedIngredients, item.removedIngredients] =
              removeCommonStrings(item.addedIngredients, item.removedIngredients);
          }
          if (item.addedIngredients && item.addedIngredients.length > 0) {
            saladStr += " with";
            for (const [
              index,
              addedIngredient,
            ] of item.addedIngredients.entries()) {
              if (saladIngredients.includes(addedIngredient)) {
                saladStr += `${index === 0 ? " " : ", "}${addedIngredient}`;
              } else {
                console.log(`We are out of ${addedIngredient}`);
              }
            }
          }
          if (item.removedIngredients && item.removedIngredients.length > 0) {
            saladStr += " without";
            for (const [
              index,
              removedIngredient,
            ] of item.removedIngredients.entries()) {
              saladStr += `${index === 0 ? " " : ", "}${removedIngredient}`;
            }
          }
          console.log(saladStr);
          break;
        }
      }
    }
  }
}

// Process requests interactively or from the input file specified on the command line
processRequests(`${pizza}> `, process.argv[2], async (request) => {
  const response = await typeChat.completeAndValidate(request);
  if (!response.success) {
    console.log(response.message);
    return;
  }
  const order = response.data;
  if (order.items.some((item) => item.itemType === "unknown")) {
    console.log("I didn't understand the following:");
    for (const item of order.items) {
      if (item.itemType === "unknown") console.log(item.text);
    }
  }
  printOrder(order);
});
