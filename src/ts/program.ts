import { Result, error, success } from "../result";
import { TypeChatLanguageModel } from "../model";
import { createTypeScriptJsonValidator } from "./validate";
import { TypeChatJsonTranslator, createJsonTranslator } from "../typechat";

const programSchemaText = `// A program consists of a sequence of function calls that are evaluated in order.
export type Program = {
    "@steps": FunctionCall[];
}

// A function call specifies a function name and a list of argument expressions. Arguments may contain
// nested function calls and result references.
export type FunctionCall = {
    // Name of the function
    "@func": string;
    // Arguments for the function, if any
    "@args"?: Expression[];
};

// An expression is a JSON value, a function call, or a reference to the result of a preceding expression.
export type Expression = JsonValue | FunctionCall | ResultReference;

// A JSON value is a string, a number, a boolean, null, an object, or an array. Function calls and result
// references can be nested in objects and arrays.
export type JsonValue = string | number | boolean | null | { [x: string]: Expression } | Expression[];

// A result reference represents the value of an expression from a preceding step.
export type ResultReference = {
    // Index of the previous expression in the "@steps" array
    "@ref": number;
};
`;

/**
 * A program consists of a sequence of function calls that are evaluated in order.
 */
export type Program = {
    "@steps": FunctionCall[];
}

/**
 * A function call specifices a function name and a list of argument expressions. Arguments may contain
 * nested function calls and result references.
 */
export type FunctionCall = {
    // Name of the function
    "@func": string;
    // Arguments for the function, if any
    "@args"?: Expression[];
};

/**
 * An expression is a JSON value, a function call, or a reference to the result of a preceding expression.
 */
export type Expression = JsonValue | FunctionCall | ResultReference;

/**
 * A JSON value is a string, a number, a boolean, null, an object, or an array. Function calls and result
 * references can be nested in objects and arrays.
 */
export type JsonValue = string | number | boolean | null | { [x: string]: Expression } | Expression[];

/**
 * A result reference represents the value of an expression from a preceding step.
 */
export type ResultReference = {
    // Index of the previous expression in the "@steps" array
    "@ref": number;
};

/**
 * Transforms a JSON program object into an equivalent TypeScript module suitable for type checking.
 * The generated module takes the form:
 * 
 *   import { API } from "./schema";
 *   function program(api: API) {
 *     const step1 = api.someFunction1(...);
 *     const step2 = api.someFunction2(...);
 *     return api.someFunction3(...);
 *   }
 * 
 * @param jsonObject A JSON program object.
 * @returns A `Success<string>` with the module source code or an `Error` explaining why the JSON object
 * couldn't be transformed.
 */
export function createModuleTextFromProgram(jsonObject: object): Result<string> {
    const steps = (jsonObject as Program)["@steps"];
    if (!(Array.isArray(steps) && steps.every(step => typeof step === "object" && step !== null && step.hasOwnProperty("@func")))) {
        return error("JSON object is not a valid program");
    }
    let hasError = false;
    let functionBody = "";
    let currentStep = 0;
    while (currentStep < steps.length) {
        functionBody += `  ${currentStep === steps.length - 1 ? `return` : `const step${currentStep + 1} =`} ${exprToString(steps[currentStep])};\n`;
        currentStep++;
    }
    return hasError ?
        error("JSON program contains an invalid expression") :
        success(`import { API } from "./schema";\nfunction program(api: API) {\n${functionBody}}`);

    function exprToString(expr: unknown): string {
        return typeof expr === "object" && expr !== null ?
            objectToString(expr as Record<string, unknown>) :
            JSON.stringify(expr);
    }

    function objectToString(obj: Record<string, unknown>) {
        if (obj.hasOwnProperty("@ref")) {
            const index = obj["@ref"];
            if (typeof index === "number" && index < currentStep && Object.keys(obj).length === 1) {
                return `step${index + 1}`;
            }
        }
        else if (obj.hasOwnProperty("@func")) {
            const func = obj["@func"];
            const hasArgs = obj.hasOwnProperty("@args");
            const args = hasArgs ? obj["@args"] : [];
            if (typeof func === "string" && (Array.isArray(args)) && Object.keys(obj).length === (hasArgs ? 2 : 1)) {
                return `api.${func}(${arrayToString(args)})`;
            }
        }
        else if (Array.isArray(obj)) {
            return `[${arrayToString(obj)}]`;
        }
        else {
            return `{ ${Object.keys(obj).map(key => `${JSON.stringify(key)}: ${exprToString(obj[key])}`).join(", ")} }`;
        }
        hasError = true;
        return "";
    }

    function arrayToString(array: unknown[]) {
        return array.map(exprToString).join(", ");
    }
}

/**
 * Evaluates a JSON program using a simple interpreter. Function calls in the program are passed to the `onCall`
 * callback function for validation and dispatch. Thus, unlike JavaScript's `eval`, access to external functionality
 * and resources is entirely controlled by the host application. Note that `onCall` is expected to return a `Promise`
 * such that function dispatch can be implemented asynchronously if desired.
 * @param program The JSON program to evaluate.
 * @param onCall A callback function for handling function calls in the program.
 * @returns A `Promise` with the value of the last expression in the program.
 */
export async function evaluateJsonProgram(program: Program, onCall: (func: string, args: unknown[]) => Promise<unknown>) {
    const results: unknown[] = [];
    for (const expr of program["@steps"]) {
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
        else if (obj.hasOwnProperty("@func")) {
            const func = obj["@func"];
            const args = obj.hasOwnProperty("@args") ? obj["@args"] : [];
            if (typeof func === "string" && Array.isArray(args)) {
                return await onCall(func, await evaluateArray(args));
            }
        }
        else if (Array.isArray(obj)) {
            return evaluateArray(obj);
        }
        else {
            const values = await Promise.all(Object.values(obj).map(evaluate));
            return Object.fromEntries(Object.keys(obj).map((k, i) => [k, values[i]]));
        }
    }

    function evaluateArray(array: unknown[]) {
        return Promise.all(array.map(evaluate));
    }
}

/**
 * Creates an object that can translate natural language requests into simple programs, represented as JSON, that compose
 * functions from a specified API. The resulting programs can be safely evaluated using the `evaluateJsonProgram`
 * function.
 * @param model The language model to use for translating requests into programs.
 * @param schema The TypeScript source code for the target API. The source code must export a type named `API`.
 * @returns A `TypeChatJsonTranslator<Program>` instance.
 */
export function createProgramTranslator(model: TypeChatLanguageModel, schema: string): TypeChatJsonTranslator<Program> {
    const validator = createTypeScriptJsonValidator<Program>(schema, "Program");
    validator.createModuleTextFromJson = createModuleTextFromProgram;
    const translator = createJsonTranslator<Program>(model, validator);
    translator.createRequestPrompt = createRequestPrompt;
    translator.createRepairPrompt = createRepairPrompt;
    return translator;

    function createRequestPrompt(request: string) {
        return `You are a service that translates user requests into programs represented as JSON using the following TypeScript definitions:\n` +
            `\`\`\`\n${programSchemaText}\`\`\`\n` +
            `The programs can call functions from the API defined in the following TypeScript definitions:\n` +
            `\`\`\`\n${validator.getSchemaText()}\`\`\`\n` +
            `The following is a user request:\n` +
            `"""\n${request}\n"""\n` +
            `The following is the user request translated into a JSON program object with 2 spaces of indentation and no properties with the value undefined:\n`;
    }

    function createRepairPrompt(validationError: string) {
        return `The JSON program object is invalid for the following reason:\n` +
            `"""\n${validationError}\n"""\n` +
            `The following is a revised JSON program object:\n`;
    }
}
