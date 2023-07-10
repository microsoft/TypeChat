import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createTypeChat, processRequests } from "typechat";
import { Cart } from "./coffeeShopSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const typeChat = createTypeChat<Cart>(model, schema, "Cart");

function processOrder(cart: Cart) {
    // Process the items in the cart
    void cart;
}

// Process requests interactively or from the input file specified on the command line
processRequests("☕> ", process.argv[2], async (request) => {
    const response = await typeChat.completeAndValidate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const cart = response.data;
    console.log(JSON.stringify(cart, undefined, 2));
    if (cart.items.some(item => item.type === "unknown")) {
        console.log("I didn't understand the following:");
        for (const item of cart.items) {
            if (item.type === "unknown") console.log(item.text);
        }
        return;
    }
    processOrder(cart);
    console.log("Success!");
});
