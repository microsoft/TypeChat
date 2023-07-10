import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createFunctionTranslator, processRequests } from "typechat";
import { RequestHandler, Api, SourceFile } from "./ProjectSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "ProjectSchema.ts"), "utf8");
const translator = createFunctionTranslator<RequestHandler>(model, schema, "RequestHandler", ["api"]);

// Process requests interactively or from the input file specified on the command line
processRequests("📋> ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
    }
    else {
        console.log(`(api) => {\n${response.data.functionBodyText}}`);
        console.log("Running program:");
        const result = response.data.getFunction()(createApi());
        console.log(`Result: ${JSON.stringify(result, undefined, 2)}`);
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
