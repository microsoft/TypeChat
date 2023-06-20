import { Response } from "./response";
import { TypeChatLanguageModel } from "./model";
import { TypeChatJsonValidator, createJsonValidator } from "./validate";

export interface TypeChat<T extends object> {
    get model(): TypeChatLanguageModel;
    get validator(): TypeChatJsonValidator<T>;
    complete(request: string): Promise<Response<string>>;
    validate(jsonText: string): Response<T>;
    completeAndValidate(request: string): Promise<Response<T>>;
}

export function createPrompt(request: string, schema: string, typeName: string) {
    return `You are a service that translates user requests into JSON objects of type "${typeName}" according to the following TypeScript definitions:\n` +
        `###\n${schema}###\n\n` +
        `The following is a user request:\n` +
        `"""\n${request}\n"""\n\n` +
        `The following is the user request translated into a JSON object with 2 spaces of indentation and no comments or null values:\n`;
}

export function createTypeChat<T extends object>(model: TypeChatLanguageModel, schema: string, typeName: string): TypeChat<T> {
    const validator = createJsonValidator<T>(schema, typeName);
    return {
        get model() { return model },
        get validator() { return validator },
        complete,
        validate,
        completeAndValidate
    };

    async function complete(request: string) {
        return await model.complete(createPrompt(request, schema, typeName));
    }

    function validate(jsonText: string) {
        return validator.validate(jsonText);
    }

    async function completeAndValidate(request: string) {
        const response = await complete(request);
        return response.success ? validate(response.data) : response;
    }
}
