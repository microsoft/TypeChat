import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createLanguageModel } from "typechat";
import { processRequests } from "typechat/interactive";
import { HealthDataResponse } from "./healthDataSchema";
import { createHealthDataTranslator } from "./translator";

const dotEnvPath = findConfig(".env");
if (!dotEnvPath) {
    console.error(
        "Error: .env file not found.\n" +
        "Copy .env.example to .env in the repository root and configure your OpenAI or Azure OpenAI credentials."
    );
    process.exit(1);
}
dotenv.config({ path: dotEnvPath });

const healthInstructions = `
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
processRequests("🤧> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log("Translation Failed ❌");
        console.log(`Context: ${response.message}`);
    }
    else {
        const healthData = response.data;
        console.log("Translation Succeeded! ✅\n");
        console.log("JSON View");
        console.log(JSON.stringify(healthData, undefined, 2));

        const message = healthData.message;
        const notTranslated = healthData.notTranslated;

        if (message) {
            console.log(`\n📝: ${message}`);
        }
            
        if (notTranslated) {
            console.log(`\n🤔: I did not understand\n ${notTranslated}`)
        }
    }
});
