import assert from "assert";
import dotenv from "dotenv";
import findConfig from "find-config";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { createZodJsonValidator } from "typechat/zod";
import { processRequests } from "typechat/interactive";
import { z } from "zod";
import { CoffeeShopSchema } from "./coffeeShopSchema";

const dotEnvPath = findConfig(".env");
assert(dotEnvPath, ".env file not found!");
dotenv.config({ path: dotEnvPath });

const model = createLanguageModel(process.env);
const validator = createZodJsonValidator(CoffeeShopSchema, "Cart");
const translator = createJsonTranslator(model, validator);

function processOrder(cart: z.TypeOf<typeof CoffeeShopSchema.Cart>) {
    // Process the items in the cart
    void cart;
}

// Process requests interactively or from the input file specified on the command line
processRequests("☕> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
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
