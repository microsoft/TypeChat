import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createHealthDataTranslator } from "./translator";
import { createLanguageModel, processRequests } from "typechat";
import { HealthDataResponse } from "./healthDataSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const healthInstructions:string = `
                            Help me enter my health data step by step.
                            Ask specific questions to gather required and optional fields
                            I have not already providedStop asking if I don't know the answer
                            Automatically fix my spelling mistakes
                            My health data may be complex: always record and return ALL of it.
                            Always return a response:
                            - If you don't understand what I say, ask a question.
                            - At least respond with an OK message.
                            `;

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "healthDataSchema.ts"), "utf8");
const translator = createHealthDataTranslator<HealthDataResponse>(model, schema, "HealthDataResponse",
                        healthInstructions);

// Process requests interactively or from the input file specified on the command line
processRequests("💉💊🤧> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log("Translation Failed ❌");
        console.log(`Context: ${response.message}`);
    }
    else {
        const healthdata = response.data;
        console.log("Translation Succeeded! ✅\n");
        console.log("JSON View");
        console.log(JSON.stringify(healthdata, undefined, 2));

        const message = healthdata["message"];
        const notTranslated = healthdata["notTranslated"];

        if (message) {
            console.log(`\n📝: ${message}`);
        }
            
        if (notTranslated) {
            console.log(`\n🤔: I did not understand\n ${notTranslated}`)
        }
    }
});
