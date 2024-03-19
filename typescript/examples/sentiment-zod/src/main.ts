import assert from "assert";
import dotenv from "dotenv";
import findConfig from "find-config";
import { createJsonTranslator, createLanguageModel, processRequests } from "typechat";
import { createZodJsonValidator } from "typechat/zod";
import { SentimentSchema } from "./sentimentSchema";

const dotEnvPath = findConfig(".env");
assert(dotEnvPath, ".env file not found!");
dotenv.config({ path: dotEnvPath });

const model = createLanguageModel(process.env);
const validator = createZodJsonValidator(SentimentSchema, "SentimentResponse");
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
