import { PromptSection, Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";

export interface TranslatorWithHistory<T extends object> {
    _chatHistory: PromptSection[];
    _maxPromptLength: number;
    _additionalAgentInstructions: string;
    _translator: TypeChatJsonTranslator<T>;
    translate(request: string): Promise<Result<T>>;
}

export function createHealthDataTranslator<T extends object>(model: TypeChatLanguageModel, schema: string, typename: string, additionalAgentInstructions: string): TranslatorWithHistory<T> {
    const _chatHistory: PromptSection[] = [];
    const _maxPromptLength = 2048;
    const _additionalAgentInstructions = additionalAgentInstructions;
    
    const validator = createTypeScriptJsonValidator<T>(schema, typename);
    const _translator = createJsonTranslator(model, validator);
    const schemaPrompt = _translator.createSystemPrompt;
    _translator.createSystemPrompt = () => {
        const now = new Date();
        return `${schemaPrompt()}\n` +
            `Use precise dates and times relative to the current date: ${now.toLocaleDateString()}, time: ${now.toTimeString().split(" ")[0]}.\n` +
            `Turn ranges like next week and next month into precise dates.\n${_additionalAgentInstructions}`;
    };
    
    const customtranslator: TranslatorWithHistory<T> = {
        _chatHistory,
        _maxPromptLength,
        _additionalAgentInstructions,
        _translator,
        translate,
    };

    return customtranslator;

    async function translate(request: string): Promise<Result<T>> {
        const response = await _translator.translate(request, _chatHistory);
        if (response.success) {
            _chatHistory.push({ role: "assistant", content: JSON.stringify(response.data, undefined, 2) });
        }
        return response;
    }
}
