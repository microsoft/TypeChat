import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { Program } from "./chatifyActionsSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const musicalNote = "\u{1F3B5}";
const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "chatifyActionsSchema.ts"), "utf8");
const translator = createJsonTranslator<Program>(model, schema, "Program");

// Process requests interactively or from the input file specified on the command line
processRequests(`${musicalNote}> `, process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const program = response.data;
    console.log(JSON.stringify(program, undefined, 2));
    console.log("Success!");
});
