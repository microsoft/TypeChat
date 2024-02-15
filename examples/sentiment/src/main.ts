import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { SentimentResponse } from "./sentimentSchema";
import { ChatOpenAI } from '@langchain/openai';

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(
	new ChatOpenAI({
		openAIApiKey: process.env['OPENAI_API_KEY'] ?? '',
		temperature: 0,
		n: 1,
	}),
);
const schema = fs.readFileSync(path.join(__dirname, "sentimentSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<SentimentResponse>(schema, "SentimentResponse");
const translator = createJsonTranslator(model, validator);

// Process requests interactively or from the input file specified on the command line
processRequests("😀> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    console.log(`The sentiment is ${response.data.sentiment}`);
});
