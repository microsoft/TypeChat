// TypeScript file for TypeChat agents.
import { Result, TypeChatJsonTranslator, TypeChatLanguageModel, createJsonTranslator, getData, success } from "typechat";
import { Program, createModuleTextFromProgram, createProgramTranslator, createTypeScriptJsonValidator, evaluateJsonProgram } from "typechat/ts";

export type AgentInfo = {
    name: string;
    description: string;
};

export interface AgentClassificationResponse {
    agenInfo : AgentInfo;
}

export type MessageHandler<T extends object> = (message: string) => Promise<Result<T>>;

export interface Agent<T extends object> extends AgentInfo {
    handleMessage(message: string): Promise<Result<T>>;
};

interface JsonPrintAgent<T extends object> extends Agent<T> {
    _translator: TypeChatJsonTranslator<T>;
}

export function createJsonPrintAgent<T extends object>(
    name: string,
    description: string,
    model: TypeChatLanguageModel,
    schema: string,
    typeName: string
): JsonPrintAgent<T> {
    const validator = createTypeScriptJsonValidator<T>(schema, typeName)
    const _translator = createJsonTranslator<T>(model, validator);
    const jsonPrintAgent: JsonPrintAgent<T> = {
        _translator,
        name: name,
        description: description,
        handleMessage: _handleMessage,
    };

    return jsonPrintAgent;

    async function _handleMessage(request: string): Promise<Result<T>> {
        const response = await _translator.translate(request);
        if (response.success) {
            console.log("Translation Succeeded! ✅\n")
            console.log("JSON View")
            console.log(JSON.stringify(response.data, undefined, 2))
        }
        else {
            console.log("Translation Failed ❌")
            console.log(`Context: ${response.message}`)
        }
        return response;
    }
}

interface MathAgent<T extends object> extends Agent<T> {
    _translator: TypeChatJsonTranslator<Program>;
    //_handleCall(func: string, args: any[]): Promise<unknown>;
}

export function createJsonMathAgent<T extends object>
    (name: string, description: string,
     model: TypeChatLanguageModel,
     schema: string): MathAgent<T>
{
    async function _handleCall(func: string, args: any[]): Promise<unknown> {
        // implementation goes here
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

    const _translator = createProgramTranslator(model, schema);
    const mathAgent : MathAgent<T> = {
        _translator,
        name: name,
        description: description,
        handleMessage: _handleMessage,
    };

    return mathAgent;

    async function _handleMessage(request: string): Promise<Result<T>> {
        const response = await _translator.translate(request);
        if (!response.success) {
            console.log(response.message);
            return response;
        }

        const program = response.data;
        console.log(getData(createModuleTextFromProgram(program)));
        console.log("Running program:");
        const result = await evaluateJsonProgram(program, _handleCall);
        console.log(`Result: ${typeof result === "number" ? result : "Error"}`);
        return success("Successful evaluation" as any);
    }
}