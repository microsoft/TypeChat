import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createFunctionTranslator, processRequests } from "typechat";
import { RequestHandler, Api } from "./chatifyActionsSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "chatifyActionsSchema.ts"), "utf8");
const translator = createFunctionTranslator<RequestHandler>(model, schema, "RequestHandler", ["api"]);

// Process requests interactively or from the input file specified on the command line
processRequests("🎵> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
    }
    else {
        console.log(`(api) => {\n${response.data.functionBodyText}}`);
        console.log("Running program:");
        response.data.getFunction()(createApi());
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
            console.log(`nonMusicQuestion(${JSON.stringify(text, undefined, 2)})`);
        },
        finalResult(result) {
            console.log(`finalResult(${JSON.stringify(result, undefined, 2)})`);
        }
    };
}
