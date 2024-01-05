import {Result, TypeChatLanguageModel, createJsonTranslator, TypeChatJsonTranslator} from "typechat";

type ChatMessage = {
    source: "system" | "user" | "assistant";
    body: string;
};

export interface TranslatorWithHistory<T extends object> {
    _chat_history: ChatMessage[];
    _max_prompt_length: number;
    _additional_agent_instructions: string;
    translator: TypeChatJsonTranslator<T>;
    translate(request: string): Promise<Result<T>>;
}

export function createHealthDataTranslator<T extends object>(model: TypeChatLanguageModel, schema: string, type_name: string, additional_agent_instructions: string): TranslatorWithHistory<T> {
    const _chat_history: ChatMessage[] = [];
    const _max_prompt_length = 2048;
    const _additional_agent_instructions = additional_agent_instructions;
    
    const translator = createJsonTranslator<T>(model, schema, type_name);
    translator.createRequestPrompt = _create_request_prompt;
    
    const customtranslator: TranslatorWithHistory<T> = {
        _chat_history,
        _max_prompt_length,
        _additional_agent_instructions,
        translator,
        translate,
    };

    return customtranslator;

    async function translate(request: string): Promise<Result<T>> {
        const response = await translator.translate(request);
        if (response.success) {
            _chat_history.push({ source: 'assistant', body: JSON.stringify(response.data) });
        }
        return response;
    }

    function _create_request_prompt(intent: string): string {
        // TODO: drop history entries if we exceed the max_prompt_length
        const history_str = JSON.stringify(_chat_history, undefined, 2);
        
        const now = new Date();

        const prompt = `
        user: You are a service that translates user requests into JSON objects of type "${type_name}" according to the following TypeScript definitions:
        '''
        ${schema}
        '''

        user:
        Use precise date and times RELATIVE TO CURRENT DATE: ${now.toLocaleDateString()} CURRENT TIME: ${now.toTimeString().split(' ')[0]}
        Also turn ranges like next week and next month into precise dates
        
        user:
        ${_additional_agent_instructions}
        
        system:
        IMPORTANT CONTEXT for the user request:
        ${history_str}

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
