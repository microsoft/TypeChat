import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createTypeChat, processRequests } from "typechat";
import { SentimentResponse } from "./sentimentSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const typeChat = createTypeChat<SentimentResponse>(model, schema, "SentimentResponse");

// Process requests interactively or from the input file specified on the command line
processRequests("😀> ", process.argv[2], async (request) => {
    const response = await typeChat.completeAndValidate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
