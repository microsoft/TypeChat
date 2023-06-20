import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createTypeChat, processRequests } from "../../typechat";
import { Cart } from "./coffeeShopSchema";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

const coffeeCup = "\u{2615}";
const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const typeChat = createTypeChat<Cart>(model, schema, "Cart");

function processOrder(cart: Cart) {
    // Process the items in the cart
}

// Process requests interactively or from the input file specified on the command line
processRequests(`${coffeeCup}> `, process.argv[2], async (request) => {
    const completion = await typeChat.complete(request);
    if (!completion.success) {
        console.log(completion.message);
        return;
    }
    console.log(completion.data);
    const validation = typeChat.validate(completion.data);
    if (!validation.success) {
        console.log(validation.message);
        return;
    }
    const cart = validation.data;
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
