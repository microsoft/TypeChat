import { Result, error } from "./result";
import { TypeChatLanguageModel } from "./model";
import { TypeChatFunction, TypeChatFunctionValidator, TypeChatJsonValidator, createFunctionValidator, createJsonValidator } from "./validate";

/**
 * Represents an object that can translate natural language requests in JSON objects of the given type.
 */
export interface TypeChat<T extends object> {
    /**
     * The associated `TypeChatLanguageModel`.
     */
    model: TypeChatLanguageModel;
    /**
     * The associated `TypeChatJsonValidator<T>`.
     */
    validator: TypeChatJsonValidator<T>;
    /**
     * A boolean indicating whether to attempt repairing JSON objects that fail to validate. The default is `true`,
     * but an application can set the property to `false` to disable repair attempts.
     */
    attemptRepair:  boolean;
    /**
     * A boolean indicating whether to delete properties with null values from parsed JSON objects. Some language
     * models (e.g. gpt-3.5-turbo) have a tendency to assign null values to optional properties instead of omitting
     * them. The default for this property is `false`, but an application can set the property to `true` for schemas
     * that don't permit null values.
     */
    stripNulls:  boolean;
    /**
     * Creates an AI language model prompt from the given request. This function is called by `completeAndValidate`
     * to obtain the prompt. An application can assign a new function to provide a different prompt.
     * @param request The natural language request.
     * @returns A prompt that combines the request with the schema and type name of the underlying validator.
     */
    createRequestPrompt(request: string): string;
    /**
     * Creates a repair prompt to append to an original prompt/response in order to repair a JSON object that
     * failed to validate. This function is called by `completeAndValidate` when `attemptRepair` is true and the
     * JSON object produced by the original prompt failed to validate. An application can assign a new function
     * to provide a different repair prompt.
     * @param validationError The error message returned by the validator.
     * @returns A repair prompt constructed from the error message.
     */
    createRepairPrompt(validationError: string): string;
    /**
     * Translates a natural language request into an object of type `T`. If the JSON object returned by
     * the language model fails to validate and the `attemptRepair` property is `true`, a second
     * attempt to translate the request will be made. The prompt for the second attempt will include the
     * diagnostics produced for the first attempt. This often helps produce a valid instance.
     * @param request The natural language request.
     * @returns A promise for the resulting object.
     */
    completeAndValidate(request: string): Promise<Result<T>>;
}

/**
 * Creates an object that can translate natural language requests into JSON objects of the given type.
 * The specified type argument `T` must be the same type as `typeName` in the given `schema`. The function
 * creates a `TypeChatJsonValidator<T>` and stores it in the `validator` property of the returned instance.
 * @param model The language model to use for translating requests into JSON.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @returns A `TypeChat<T>` instance.
 */
export function createTypeChat<T extends object>(model: TypeChatLanguageModel, schema: string, typeName: string): TypeChat<T> {
    const validator = createJsonValidator<T>(schema, typeName);
    const typeChat: TypeChat<T> = {
        model,
        validator,
        attemptRepair: true,
        stripNulls: false,
        createRequestPrompt,
        createRepairPrompt,
        completeAndValidate
    };
    return typeChat;

    function createRequestPrompt(request: string) {
        return `You are a service that translates user requests into JSON objects of type "${validator.typeName}" according to the following TypeScript definitions:\n` +
            `###\n${validator.schema}###\n` +
            `The following is a user request:\n` +
            `"""\n${request}\n"""\n` +
            `The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:\n`;
    }

    function createRepairPrompt(validationError: string) {
        return `The JSON object is invalid for the following reason:\n` +
            `${validationError}\n` +
            `The following is a revised JSON object:\n`;
    }

    async function completeAndValidate(request: string) {
        let prompt = typeChat.createRequestPrompt(request);
        let attemptRepair = typeChat.attemptRepair;
        while (true) {
            const response = await model.complete(prompt);
            if (!response.success) {
                return response;
            }
            const validation = validator.validate(response.data);
            if (validation.success) {
                return validation;
            }
            if (!attemptRepair) {
                return error(`JSON object validation failed:\n${response.data}\n${validation.message}`);
            }
            prompt += `${response.data}\n${typeChat.createRepairPrompt(validation.message)}`;
            attemptRepair = false;
        }
    }
}

/**
 * An object that can translate natural language requests into JavaScript functions.
 */
export interface TypeChatFunctionTranslator<T extends Function> {
    /**
     * The associated `TypeChatLanguageModel`.
     */
    model: TypeChatLanguageModel;
    /**
     * The associated `TypeChatFunctionValidator<T>`.
     */
    validator: TypeChatFunctionValidator<T>;
    /**
     * A boolean indicating whether to attempt repairing functions that fail to validate. The default is `true`,
     * but an application can set the property to `false` to disable repair attempts.
     */
    attemptRepair:  boolean;
    /**
     * Creates an AI language model prompt from the given request. This function is called by `translate`
     * to obtain the prompt. An application can assign a new function to provide a different prompt.
     * @param request The natural language request.
     * @returns A prompt that combines the request with the schema and type name of the underlying validator.
     */
    createRequestPrompt(request: string): string;
    /**
     * Creates a repair prompt to append to an original prompt/response in order to repair a function that
     * failed to validate. This function is called by `translate` when `attemptRepair` is true and the
     * function generated by the original prompt failed to validate. An application can assign a new function
     * to provide a different repair prompt.
     * @param validationError The error message returned by the validator.
     * @returns A repair prompt constructed from the error message.
     */
    createRepairPrompt(validationError: string): string;
    /**
     * Translates a natural language request into an object of type `TypeChatFunction<T>`. If the function
     * generated by the language model fails to validate and the `attemptRepair` property is `true`, a second
     * attempt to translate the request will be made. The prompt for the second attempt will include the
     * diagnostics produced for the first attempt. This often helps produce a valid result.
     * @param request The natural language request.
     * @returns A promise for the resulting object.
     */
    translate(request: string): Promise<Result<TypeChatFunction<T>>>;
}

/**
 * Creates an object that can translate natural language requests into JavaScript functions of the given type.
 * The specified type argument `T` must be the same type as `typeName` in the given `schema`. The function
 * creates a `TypeChatJsonValidator<T>` and stores it in the `validator` property of the returned instance.
 * @param model The language model to use for translating requests.
 * @param schema A string containing the TypeScript source code for the function schema.
 * @param typeName The name of the target function type in the schema.
 * @param parameterNames The names to use for the parameters of the generated function.
 * @returns A `TypeChatFunctionTranslator<T>` instance.
 */
export function createFunctionTranslator<T extends Function>(model: TypeChatLanguageModel, schema: string, typeName: string, parameterNames: string[]): TypeChatFunctionTranslator<T> {
    const validator = createFunctionValidator<T>(schema, typeName, parameterNames);
    const typeChat: TypeChatFunctionTranslator<T> = {
        model,
        validator,
        attemptRepair: true,
        createRequestPrompt,
        createRepairPrompt,
        translate
    };
    return typeChat;

    function createRequestPrompt(request: string) {
        return `You are a service that translates user requests into JavaScript functions according to the following TypeScript definitions:\n` +
            `\`\`\`\n${validator.schema}\`\`\`\n` +
            `The following is a user request:\n` +
            `"""\n${request}\n"""\n` +
            `Respond with a JavaScript function that satisfies the user request. Prefer const for variable declarations. Never use var, for, while, do, switch, and try statements. Only output the JavaScript code, no comments.\n`;
    }

    function createRepairPrompt(validationError: string) {
        return `The function is invalid for the following reason:\n` +
            `${validationError}\n` +
            `The following is a revised function:\n`;
    }

    async function translate(request: string) {
        let prompt = typeChat.createRequestPrompt(request);
        let attemptRepair = typeChat.attemptRepair;
        while (true) {
            prompt += `\`\`\`\nconst func: RequestHandler = (api) => {\n`;
            const response = await model.complete(prompt);
            if (!response.success) {
                return response;
            }
            const responseText = response.data;
            const endIndex = responseText.lastIndexOf("}");
            const functionBodyText = responseText.slice(0, endIndex);
            const validation = validator.validate(functionBodyText);
            if (validation.success) {
                return validation;
            }
            if (!attemptRepair) {
                return error(`Function validation failed: ${validation.message}\n(api) => {\n${functionBodyText}}`);
            }
            prompt += `${responseText}\n${typeChat.createRepairPrompt(validation.message)}`;
            attemptRepair = false;
        }
    }
}
