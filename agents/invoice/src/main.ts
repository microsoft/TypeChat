import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { Invoice } from "./soccerShopSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "soccerShopSchema.ts"), "utf8");
const translator = createJsonTranslator<Invoice>(model, schema, "Invoice");

function generateInvoice(invoice: Invoice) {
    // Create an invoice
    void invoice;
}

function printInvoice(invoice: Invoice) {
    console.log(`Printing invoice to ${invoice.client.name}...`);
}

// Process requests interactively or from the input file specified on the command line
processRequests("QB Assistant> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const invoice = response.data;
    console.log(JSON.stringify(invoice, undefined, 2));
    if (invoice.items.some(item => item.type === "unknown")) {
        console.log("I didn't understand the following:");
        for (const item of invoice.items) {
            if (item.type === "unknown") console.log(item.text);
        }
        console.log("Can you tell me more?")
        return;
    }
    generateInvoice(invoice);
    printInvoice(invoice);
    console.log("Success!");
});
