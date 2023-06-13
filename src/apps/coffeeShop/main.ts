import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { llmComplete } from "../../lib";
import { parseAndValidateJsonText } from "./validate";
import { Cart } from "./coffeeShopSchema";

const schema = fs.readFileSync(path.join(__dirname, "coffeeShopSchema.ts"), "utf8");
const coffeeCup = "\u{2615}";

function createPrompt(request: string, schema: string, typeName: string) {
    return `You are a service that translates user requests into JSON objects of type "${typeName}" according to the following TypeScript definitions:\n` +
        `###\n${schema}###\n\n` +
        `The following is a user request:\n` +
        `"""\n${request}\n"""\n\n` +
        `The following is the user request translated to a single JSON object with no comments and no null or undefined values:\n`;
}

async function processRequests(interactivePrompt: string, inputFileName: string | undefined, processRequest: (request: string) => Promise<void>) {
    if (inputFileName) {
        const lines = fs.readFileSync(inputFileName).toString().split(/\r?\n/);
        for (const line of lines) {
            if (line.length) {
                console.log(interactivePrompt + line);
                await processRequest(line);
            }
        }
    }
    else {
        const stdio = readline.createInterface({ input: process.stdin, output: process.stdout });
        while (true) {
            const input = await stdio.question(interactivePrompt);
            if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
                break;
            }
            else if (input.length) {
                await processRequest(input);
            }
        }
        stdio.close();
    }
}

function processOrder(cart: Cart) {
    // Process the items in the cart
}

// Process requests interactively or from the input file specified on the command line
processRequests(`${coffeeCup}> `, process.argv[2], async (request) => {
    try {
        const response = await llmComplete(createPrompt(request, schema, "Cart"));
        console.log(response);
        const cart = parseAndValidateJsonText(response, schema, "Cart") as Cart;
        if (!cart.items.some(item => item.type === "unknown")) {
            processOrder(cart);
            console.log("Success!");
        }
        else {
            console.log("I didn't understand the following:");
            for (const item of cart.items) {
                if (item.type === "unknown") console.log(item.text);
            }
        }
    }
    catch (e) {
        if (e instanceof Error) {
            console.log(e.message);
        }
    }
});
