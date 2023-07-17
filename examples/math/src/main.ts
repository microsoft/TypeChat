import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, processRequests, createProgramTranslator, evaluateJsonProgram, getData } from "typechat";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const equalsSign = "\u{1F7F0}";
const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "mathSchema.ts"), "utf8");
const translator = createProgramTranslator(model, schema);

// Process requests interactively or from the input file specified on the command line
processRequests(`${equalsSign}> `, process.argv[2], async (request) => {
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

async function handleCall(func: string, args: any[]): Promise<unknown> {
    console.log(`${func}(${args.map(arg => JSON.stringify(arg, undefined, 2)).join(", ")})`);
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
    }
}
