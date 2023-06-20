import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createTypeChat, processRequests } from "../../typechat";
import { CalendarActions } from './calendarActionsSchema';

dotenv.config({ path: path.join(__dirname, "../../../.env") });

const calendarChar = "\u{1F4C5}";
const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "calendarActionsSchema.ts"), "utf8");
const typeChat = createTypeChat<CalendarActions>(model, schema, "CalendarActions");

function processActions(actions: CalendarActions) {
    // Process the items in the cart
}

// Process requests interactively or from the input file specified on the command line
processRequests(`${calendarChar}> `, process.argv[2], async (request) => {
    const completion = await typeChat.complete(request);
    if (!completion.success) {
        console.log(completion.message);
        return;
    }
    console.log(completion.data);
    const validation = typeChat.validate(completion.data);
    if (!validation.success) {
        console.log(validation.message);
        return;
    }
    const actions = validation.data.actions;
    if (actions.some(item => item.actionType === "unknown")) {
        console.log("I didn't understand the following:");
        for (const action of actions) {
            if (action.actionType === "unknown") console.log(action.text);
        }
        return;
    }
});
