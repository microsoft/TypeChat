import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createProgramTranslator, getData, processRequests, evaluateJsonProgram } from "typechat";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const musicalNote = "\u{1F3B5}";
const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "chatifyActionsSchema.ts"), "utf8");
const translator = createProgramTranslator(model, schema);

// Process requests interactively or from the input file specified on the command line
processRequests(`${musicalNote}> `, process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const program = response.data;
    console.log(getData(translator.validator.createModuleTextFromJson(program)));
    console.log("Running program:");
    const result = await evaluateJsonProgram(program, handleCall);
    if (result !== undefined) {
        console.log(`Result: ${JSON.stringify(result, undefined, 2)}`)
    }
});

async function handleCall(func: string, args: unknown[]): Promise<unknown> {
    console.log(`${func}(${args.map(arg => JSON.stringify(arg, undefined, 2)).join(", ")})`);
    switch (func) {
        case "getRecentlyPlayed":
            return ["Track one", "Track two", "Track three"];
        case "searchTracks":
            return ["Search one", "Search two", "Search three"];
        case "filterTracks":
            return ["Filter one", "Filter two", "Filter three"];
        case "sortTracks":
            return ["Sort one", "Sort two", "Sort three"];
        case "mergeTrackLists":
            return ["Merge one", "Merge two", "Merge three"];
    }
}
