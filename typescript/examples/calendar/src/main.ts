import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createJsonTranslator, createLanguageModel } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { processRequests } from "typechat/interactive";
import { CalendarActions } from './calendarActionsSchema';

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
const schema = fs.readFileSync(path.join(__dirname, "calendarActionsSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<CalendarActions>(schema, "CalendarActions");
const translator = createJsonTranslator(model, validator);
//translator.stripNulls = true;

// Process requests interactively or from the input file specified on the command line
processRequests("📅> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const calendarActions = response.data;
    console.log(JSON.stringify(calendarActions, undefined, 2));
    if (calendarActions.actions.some(item => item.actionType === "unknown")) {
        console.log("I didn't understand the following:");
        for (const action of calendarActions.actions) {
            if (action.actionType === "unknown") console.log(action.text);
        }
        return;
    }
});
