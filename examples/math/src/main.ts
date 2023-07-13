import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLanguageModel, createJsonTranslator, processRequests } from "typechat";
import { Program } from "./mathSchema";

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const equalsSign = "\u{1F7F0}";
const model = createLanguageModel(process.env);
const schema = fs.readFileSync(path.join(__dirname, "mathSchema.ts"), "utf8");
const translator = createJsonTranslator<Program>(model, schema, "Program");

// Process requests interactively or from the input file specified on the command line
processRequests(`${equalsSign}> `, process.argv[2], async (request) => {
    const response = await translator.translate(request);
    if (!response.success) {
        console.log(response.message);
        return;
    }
    const program = response.data;
    console.log(programToText(program));
    console.log("Running program:");
    const result = await runProgram(program, handleCall);
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

function programToText(program: Program) {
    return program.expressions.map((expr, i) => `const step${i + 1} = ${exprToString(expr)};`).join("\n");

    function exprToString(expr: unknown): string {
        return typeof expr === "object" && expr !== null ?
            objectToString(expr as Record<string, unknown>) :
            JSON.stringify(expr);
    }

    function objectToString(obj: Record<string, unknown>) {
        if (obj.hasOwnProperty("@ref")) {
            const index = obj["@ref"];
            if (typeof index === "number") {
                return `step${index + 1}`;
            }
        }
        if (obj.hasOwnProperty("@func") && obj.hasOwnProperty("@args")) {
            const func = obj["@func"];
            const args = obj["@args"];
            if (typeof func === "string" && Array.isArray(args)) {
                return `${func}(${arrayToString(args)})`;
            }
        }
        if (Array.isArray(obj)) {
            return `[${arrayToString(obj)}]`;
        }
        return `{ ${Object.keys(obj).map(key => `${JSON.stringify(key)}: ${exprToString(obj[key])}`).join(", ")} }`;
    }

    function arrayToString(array: unknown[]) {
        return array.map(exprToString).join(", ");
    }
}

async function runProgram(program: Program, onCall: (func: string, args: unknown[]) => Promise<unknown>) {
    const results: unknown[] = [];
    for (const expr of program.expressions) {
        results.push(await evaluate(expr));
    }
    return results.length > 0 ? results[results.length - 1] : undefined;

    async function evaluate(expr: unknown): Promise<unknown> {
        return typeof expr === "object" && expr !== null ?
            await evaluateObject(expr as Record<string, unknown>) :
            expr;
    }

    async function evaluateObject(obj: Record<string, unknown>) {
        if (obj.hasOwnProperty("@ref")) {
            const index = obj["@ref"];
            if (typeof index === "number" && index < results.length) {
                return results[index];
            }
        }
        if (obj.hasOwnProperty("@func") && obj.hasOwnProperty("@args")) {
            const func = obj["@func"];
            const args = obj["@args"];
            if (typeof func === "string" && Array.isArray(args)) {
                return await onCall(func, await evaluateArray(args));
            }
        }
        if (Array.isArray(obj)) {
            return evaluateArray(obj);
        }
        const values = await Promise.all(Object.values(obj).map(evaluate));
        return Object.fromEntries(Object.keys(obj).map((k, i) => [k, values[i]]));
    }

    function evaluateArray(array: unknown[]) {
        return Promise.all(array.map(evaluate));
    }
}
