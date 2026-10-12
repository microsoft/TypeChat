import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { processRequests } from "typechat/interactive";
import { Cart } from "./coffeeShopSchema";

const dotEnvPath = findConfig(".env");
if (!dotEnvPath) {
    console.error(
        "Error: .env file not found.\n" +
        "Copy .env.example to .env in the repository root and configure your OpenAI or Azure OpenAI credentials."
    );
    process.exit(1);
}
dotenv.config({ path: dotEnvPath });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<Cart>(schema, "Cart");
const translator = createJsonTranslator(model, validator);

function processOrder(cart: Cart) {
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
