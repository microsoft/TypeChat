import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createFunctionValidator, processRequests } from "typechat";
import { Api, RequestHandler } from "./chatifyActionsSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const musicalNote = "\u{1F3B5}";
const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "chatifyActionsSchema.ts"), "utf8");
const validator = createFunctionValidator<RequestHandler>(schema, "RequestHandler", ["api"]);

// Process requests interactively or from the input file specified on the command line
processRequests(`${musicalNote}> `, process.argv[2], async (request) => {
    const prompt = `You are a service that translates user requests into JavaScript functions according to the following TypeScript definitions:\n` +
        "```\n" +
        schema +
        "```\n" +
        `The following is a user request:\n` +
        `"""\n${request}\n"""\n` +
        `Respond with a JavaScript function that satisfies the user request. Only use const for variable declarations. Never use let, for, while, and do statements. Only output the JavaScript code, no comments.\n` +
        "```\n" +
        `const func: RequestHandler = (api) => {\n`;
    const response = await model.complete(prompt);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const text = response.data;
    const endIndex = text.lastIndexOf("}");
    const functionBodyText = text.slice(0, endIndex);
    console.log(`(api) => {\n${functionBodyText}}`);
    const validation = validator.validate(functionBodyText);
    if (!validation.success) {
        console.log(validation.message);
    }
    else {
        console.log("Running program:");
        validation.data.getFunction()(createApi());
    }
    console.log();
});

function createApi(): Api {
    return {
        getRecentlyPlayed(args) {
            console.log(`getRecentlyPlayed(${JSON.stringify(args, undefined, 2)})`);
            return ["Track one", "Track two", "Track three"];
        },
        pause() {
            console.log(`pause()`);
        },
        play() {
            console.log(`play()`);
        },
        setVolume(args) {
            console.log(`setVolume(${JSON.stringify(args, undefined, 2)})`);
        },
        searchTracks(query) {
            console.log(`searchTracks(${JSON.stringify(query, undefined, 2)})`);
            return ["Search one", "Search two", "Search three"];
        },
        playTracks(args) {
            console.log(`playTracks(${JSON.stringify(args, undefined, 2)})`);
        },
        printTracks(args) {
            console.log(`printTracks(${JSON.stringify(args, undefined, 2)})`);
        },
        filterTracks(args) {
            console.log(`filterTracks(${JSON.stringify(args, undefined, 2)})`);
            return ["Filter one", "Filter two", "Filter three"];
        },
        sortTracks(args) {
            console.log(`sortTracks(${JSON.stringify(args, undefined, 2)})`);
            return ["Sort one", "Sort two", "Sort three"];
        },
        createPlaylist(args) {
            console.log(`createPlayList(${JSON.stringify(args, undefined, 2)})`);
        },
        unknownAction(text) {
            console.log(`unknownAction(${JSON.stringify(text, undefined, 2)})`);
        },
        nonMusicQuestion(text) {
            console.log(`unknownAction(${JSON.stringify(text, undefined, 2)})`);
        },
        finalResult(result) {
            console.log(`finalResult(${JSON.stringify(result, undefined, 2)})`);
        }
    };
}
