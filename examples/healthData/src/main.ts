import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createHealthDataTranslator } from "./translator";
import { createLanguageModel, processRequests } from "typechat";
import { HealthDataResponse } from "./healthDataSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "healthDataSchema.ts"), "utf8");
const translator = createHealthDataTranslator<HealthDataResponse>(model, schema, "HealthDataResponse", "");

// Process requests interactively or from the input file specified on the command line
processRequests("💉💊🤧> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const healthdata = response.data;
    console.log(JSON.stringify(healthdata, undefined, 2));
    console.log("Success!");
});
