import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createFunctionValidator, processRequests } from "typechat";
import { Api, RequestHandler, SourceFile } from "./ProjectSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const clipboard = "\u{1F4CB}";
const model = createLanguageModel();
const schema = fs.readFileSync(path.join(__dirname, "ProjectSchema.ts"), "utf8");
const validator = createFunctionValidator<RequestHandler>(schema, "RequestHandler", ["api"]);

// Process requests interactively or from the input file specified on the command line
processRequests(`${clipboard}> `, process.argv[2], async (request) => {
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
        getProjectFileNames() {
            console.log(`getting project file names`);
            return ["one.ts", "two.ts", "three.ts"];
        },
        closeProject() {
            console.log("closing project");
        },
        openFile(fileName) {
            console.log(`opening ${fileName}`);
            return createSourceFile(fileName);
        },
        unknownAction(text) {
            console.log(`Unknown action: ${text}`);
        }
    }
}

function createSourceFile(fileName: string): SourceFile {
    return {
        fileName,
        getText() {
            console.log(`getting text of ${fileName}`);
            return `Text of source file ${fileName}`;
        },
        setText(_text) {
            console.log(`setting text of ${fileName}`);
        },
        save() {
            console.log(`saving ${fileName}`);
        },
        close() {
            console.log(`closing ${fileName}`);
        }
    }
}
