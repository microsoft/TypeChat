import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, processRequests, getData } from "typechat";
import { createProgramTranslator, createModuleTextFromProgram, evaluateJsonProgram } from "typechat/ts";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "mathSchema.ts"), "utf8");
const translator = createProgramTranslator(model, schema);

// Process requests interactively or from the input file specified on the command line
processRequests("🧮 > ", process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const program = response.data;
    console.log(getData(createModuleTextFromProgram(program)));
    console.log("Running program:");
    const result = await evaluateJsonProgram(program, handleCall);
    console.log(`Result: ${typeof result === "number" ? result : "Error"}`);
});

async function handleCall(func: string, args: any[]): Promise<unknown> {
    console.log(`${func}(${args.map(arg => typeof arg === "number" ? arg : JSON.stringify(arg, undefined, 2)).join(", ")})`);
    switch (func) {
        case "add":
            return args[0] + args[1];
        case "sub":
            return args[0] - args[1];
        case "mul":
            return args[0] * args[1];
        case "div":
            return args[0] / args[1];
        case "neg":
            return -args[0];
        case "id":
            return args[0];
    }
    return NaN;
}
