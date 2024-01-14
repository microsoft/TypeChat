// TypeScript file for TypeChat agents.
import { Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator } from "typechat";

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

export function createJsonPrintAgent<T extends object>
    (name: string, description: string,
     model: TypeChatLanguageModel,
     schema: string, typename: string): JsonPrintAgent<T>
{
    const _translator = createJsonTranslator<T>(model, schema, typename);
    const josnPrintAgent: JsonPrintAgent<T> = {
        _translator,
        name: name,
        description: description,
        handleMessage: handle_request,
    };

    return josnPrintAgent;

    async function handle_request(request: string): Promise<Result<T>> {
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