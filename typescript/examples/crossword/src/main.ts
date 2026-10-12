import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createLanguageModel } from "typechat";
import { processRequests } from "typechat/interactive";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { CrosswordActions } from "./crosswordSchema";
import { createCrosswordActionTranslator } from "./translator";

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
const schema = fs.readFileSync(path.join(__dirname, "crosswordSchema.ts"), "utf8");

const rawImage = fs.readFileSync(path.join(__dirname, "puzzleScreenshot.jpeg"),"base64");
const screenshot = `data:image/jpeg;base64,${rawImage}`;

const validator = createTypeScriptJsonValidator<CrosswordActions>(schema, "CrosswordActions");
const translator = createCrosswordActionTranslator(model, validator, screenshot);

// Process requests interactively or from the input file specified on the command line
processRequests("🏁> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }

    console.log(JSON.stringify(response.data));
});
