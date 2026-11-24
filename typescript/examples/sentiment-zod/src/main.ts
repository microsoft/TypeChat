import dotenv from "dotenv";
import findConfig from "find-config";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { processRequests } from "typechat/interactive";
import { createZodJsonValidator } from "typechat/zod";
import { SentimentSchema } from "./sentimentSchema";

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
