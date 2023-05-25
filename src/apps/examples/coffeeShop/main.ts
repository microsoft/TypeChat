import { readFileSync } from "fs";
import * as readline from "readline/promises";
import { complete } from "./llm";
import { validateJsonText } from "./validate";
import { Cart, Product } from "./coffeeShopSchema";

function createPrompt(schema: string, typeName: string, request: string) {
    return `The following is a TypeScript definition of the schema for a JSON object.\n` +
        `${schema}\n` +
        `In the following paragraph is a request. Translate this request to a **single** JSON object of type ${typeName}.\n` +
        `${request}\n` +
        `JSON object with no comments and no null or undefined values:\n`;
}

function processOrder(cart: Cart) {
    // Process the items in the cart
}

async function test() {
    const schema = readFileSync("coffeeShopSchema.ts", "utf8");
    const stdio = readline.createInterface({ input: process.stdin, output: process.stdout });
    while (true) {
        const input = await stdio.question("Order? ");
        if (input.length === 0) break;
        const prompt = createPrompt(schema, "Cart", input);
        const response = await complete(prompt);
        const result = response.success ? validateJsonText(response.data, schema, "Cart") : response;
        if (result.success) {
            console.log(JSON.stringify(result.data, undefined, 2));
            processOrder(result.data as Cart);
        }
        else {
            console.log(result.message);
            if (result.diagnostics) {
                console.log(result.diagnostics.join("\n"));
            }
        }
    }
}

test();
