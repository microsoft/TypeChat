import {Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator} from "typechat";

type ChatMessage = {
    source: "system" | "user" | "assistant";
    body: string;
};

export interface TranslatorWithHistory<T extends object> {
    _chatHistory: ChatMessage[];
    _maxPromptLength: number;
    _additionalAgentInstructions: string;
    _translator: TypeChatJsonTranslator<T>;
    translate(request: string): Promise<Result<T>>;
}

export function createHealthDataTranslator<T extends object>(model: TypeChatLanguageModel, schema: string, typename: string, additionalAgentInstructions: string): TranslatorWithHistory<T> {
    const _chatHistory: ChatMessage[] = [];
    const _maxPromptLength = 2048;
    const _additionalAgentInstructions = additionalAgentInstructions;
    
    const _translator = createJsonTranslator<T>(model, schema, typename);
    _translator.createRequestPrompt = createRequestPrompt;
    
    const customtranslator: TranslatorWithHistory<T> = {
        _chatHistory,
        _maxPromptLength,
        _additionalAgentInstructions,
        _translator,
        translate,
    };

    return customtranslator;

    async function translate(request: string): Promise<Result<T>> {
        const response = await _translator.translate(request);
        if (response.success) {
            _chatHistory.push({ source: "assistant", body: JSON.stringify(response.data) });
        }
        return response;
    }

    function createRequestPrompt(intent: string): string {
        // TODO: drop history entries if we exceed the max_prompt_length
        const historyStr = JSON.stringify(_chatHistory, undefined, 2);
        
        const now = new Date();

        const prompt = `
user: You are a service that translates user requests into JSON objects of type "${typename}" according to the following TypeScript definitions:
'''
${schema}
'''

user:
Use precise date and times RELATIVE TO CURRENT DATE: ${now.toLocaleDateString()} CURRENT TIME: ${now.toTimeString().split(' ')[0]}
Also turn ranges like next week and next month into precise dates

user:
${_additionalAgentInstructions}

system:
IMPORTANT CONTEXT for the user request:
${historyStr}

user:
The following is a user request:
'''
${intent}
'''
The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:
"""
`;
        return prompt;
    }
}
