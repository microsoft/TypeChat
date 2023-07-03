import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { TypeChatProgram, createLanguageModel, createProgramValidator, processRequests } from "typechat";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const musicalNote = "\u{1F3B5}";
const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "chatifyActionsSchema.ts"), "utf8");
const validator = createProgramValidator(schema, ["api"]);

// Process requests interactively or from the input file specified on the command line
processRequests(`${musicalNote}> `, process.argv[2], async (request) => {
    const prompt = `You are a service that translates user requests into JavaScript programs that call functions from the following TypeScript definitions:\n` +
        "```\n" +
        schema +
        "```\n" +
        `The following is a user request:\n` +
        `"""\n${request}\n"""\n` +
        `Respond with a JavaScript program that satisfies the user request. Use const for variable declarations. Only output the JavaScript code, no comments.\n`;
    const response = await model.complete(prompt);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const text = response.data;
    const preamble = "```javascript\n";
    const postamble = "\n```";
    const programText = text.startsWith(preamble) && text.endsWith(postamble) ? text.slice(preamble.length, text.length - postamble.length) : text;
    console.log(programText);
    const validation = validator.validate(programText);
    if (!validation.success) {
        console.log(validation.message);
    }
    else {
        runProgram(validation.data);
    }
    console.log();
});

function runProgram(program: TypeChatProgram) {
    const api = {};
    program.run({ api }, (object, methodName, args) => {
        if (object === api) {
            console.log(`Call: ${methodName}(${args.map(arg => JSON.stringify(arg, undefined, 2)).join(", ")})`);
            switch (methodName) {
                case "getRecentlyPlayed":
                    return ["recent one", "recent two", "recent three"];
                case "searchTracks":
                    return ["search one", "search two", "search three"];
                case "filterTracks":
                    return { trackList: args[0].trackList.map((s: string) => `${args[0].filter} ${s}`) };
                case "sortTracks":
                    return args[0].trackList.map((s: string) => `sorted ${s}`);
            }
        }
        return undefined;
    });
}
