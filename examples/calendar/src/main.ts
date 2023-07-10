import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { processRequests, createTypeChat, createLanguageModel } from "typechat";
import { CalendarActions } from './calendarActionsSchema';

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "calendarActionsSchema.ts"), "utf8");
const typeChat = createTypeChat<CalendarActions>(model, schema, "CalendarActions");
typeChat.stripNulls = true;

// Process requests interactively or from the input file specified on the command line
processRequests("📅> ", process.argv[2], async (request) => {
    const response = await typeChat.completeAndValidate(request);
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
