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
    console.log("Running program:");
    const result = await runProgram(program, handleCall);
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

async function runProgram(program: Program, onCall: (func: string, args: unknown[]) => Promise<unknown>) {
    const results: unknown[] = [];
    for (const statement of program.statements) {
        results.push(await onCall(statement.func, dereference(statement.args)));
    }
    return results.length > 0 ? results[results.length - 1] : undefined;

    function dereference<T>(value: T): T {
        if (typeof value === "object" && value !== null) {
            if (value.hasOwnProperty("@index")) {
                const index = (value as Record<string, unknown>)["@index"];
                if (typeof index === "number" && index < results.length) {
                    return results[index] as T;
                }
            }
            if (Array.isArray(value)) {
                return value.map(dereference) as T;
            }
            const result: Record<string, unknown> = {};
            for (const key in value) {
                result[key] = dereference((value as Record<string, unknown>)[key]);
            }
            return result as T;
        }
        return value;
    }
}
