import { Result, success, error, withResponseMetadata, TypeChatResponseMetadata, Error as TypeChatError } from "./result.js";
import { TypeChatLanguageModel, PromptSection, PromptContent } from "./model.js";
import { typeChatSchemaValidation } from "./schemaValidation.js";

export { typeChatSchemaValidation } from "./schemaValidation.js";

export interface TypeChatTranslatorOptions {
    /** Use separate system and user messages (default), or explicitly select the 0.2 request prompt. */
    promptLayout?: "schema-first" | "legacy";
}

/**
 * Represents an object that can translate natural language requests in JSON objects of the given type.
 */
export interface TypeChatJsonTranslator<T extends object> {
    /**
     * The associated `TypeChatLanguageModel`.
     */
    model: TypeChatLanguageModel;
    /**
     * The associated `TypeChatJsonValidator<T>`.
     */
    validator: TypeChatJsonValidator<T>;
    /**
     * A boolean indicating whether to attempt one repair when the response has no JSON object, the JSON cannot
     * be parsed, or the object fails to validate. The default is `true`, but an application can set the property
     * to `false` to disable repair attempts.
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
     * Creates the schema-first system message. Include only application-owned instructions, schema,
     * and output rules, not user requests, model output, or history.
     */
    createSystemPrompt(): string;
    /**
     * Creates the final user message in the legacy layout. To use an existing override, select
     * `{ promptLayout: "legacy" }` at construction. Its content is never used as a system message.
     */
    createRequestPrompt(request: string): PromptContent;
    /**
     * Creates a repair prompt to append to an original prompt/response. This function is called when
     * `attemptRepair` is true and the response has no usable JSON object or the object failed to validate.
     * An application can assign a new function to provide a different repair prompt.
     * @param validationError The diagnostic for the failed response.
     * @returns A repair prompt constructed from the error message.
     */
    createRepairPrompt(validationError: string): string;
    /**
     * Optionally implements additional validation logic beyond what is expressed in the schema. This function is
     * called following successful schema validation of an instance. By default the function just returns a
     * `Success<T>` for the given instance, but an application can assign a new function that implements any
     * additional validation.
     * @param instance The instance to validate.
     * @returns A `Success<T>` with the final validated instance, or an `Error` explaining the validation failure.
     */
    validateInstance(instance: T): Result<T>;
    /**
     * Translates a natural language request into an object of type `T`. If the response has no JSON object,
     * the JSON cannot be parsed, or the object fails to validate, and `attemptRepair` is `true`, one further
     * attempt is made. The repair prompt includes the diagnostic from the first attempt. This often helps
     * produce a valid instance.
     * A failure retains the latest rejected candidate and available model response text. These may
     * come from different attempts if a repair response couldn't be parsed.
     * Optional result metadata retains response records and reported usage across both attempts.
     * @param request The natural language request.
     * @param promptPreamble Optional context before the current user message (after the system message
     *   in the default layout). A string becomes one user message; sections retain their roles and order.
     * @returns A promise for the resulting object.
     */
    translate(request: string, promptPreamble?: string | PromptSection[]): Promise<Result<T>>;
}

/**
 * An object that represents a TypeScript schema for JSON objects.
 */
export interface TypeChatJsonValidator<T extends object> {
    /**
     * Return a string containing TypeScript source code for the validation schema.
     */
    getSchemaText(): string;
    /**
     * Return the name of the JSON object target type in the schema.
     */
    getTypeName(): string;
    /**
     * Validates the given JSON object according to the associated TypeScript schema. Returns a
     * `Success<T>` object containing the JSON object if validation was successful. Otherwise, returns
     * an `Error` object with a `message` describing the error and, when available, rejected `data`.
     * @param jsonText The JSON object to validate.
     * @returns The JSON object or an error message.
     */
    validate(jsonObject: object): Result<T>;
}

export interface TypeChatJsonValidatorWithSchemaValidation<T extends object> extends TypeChatJsonValidator<T> {
    [typeChatSchemaValidation](): Result<void>;
}

/**
 * Creates an object that can translate natural language requests into JSON objects of the given type.
 * @param model The language model to use for translating requests into JSON.
 * @param validator Supplies the schema and validates the translated object.
 * @param options Selects the prompt layout.
 * @returns A `TypeChatJsonTranslator<T>` instance.
 */
export function createJsonTranslator<T extends object>(
    model: TypeChatLanguageModel, validator: TypeChatJsonValidator<T>, { promptLayout = "schema-first" }: TypeChatTranslatorOptions = {}
): TypeChatJsonTranslator<T> {
    if (promptLayout !== "schema-first" && promptLayout !== "legacy") {
        throw new Error(`Unknown promptLayout: ${promptLayout}. Expected "schema-first" or "legacy".`);
    }
    const typeChat: TypeChatJsonTranslator<T> = {
        model,
        validator,
        attemptRepair: true,
        stripNulls: false,
        createSystemPrompt,
        createRequestPrompt,
        createRepairPrompt,
        validateInstance: success,
        translate
    };
    return typeChat;

    function createSystemPrompt() {
        return `Translate user requests into JSON objects of type "${validator.getTypeName()}" using the following TypeScript definitions:\n` +
            `\`\`\`\n${validator.getSchemaText()}\n\`\`\`\n` +
            `Return only the JSON object with 2 spaces of indentation and no properties with the value undefined.`;
    }

    function createRequestPrompt(request: string) {
        return `You are a service that translates user requests into JSON objects of type "${validator.getTypeName()}" according to the following TypeScript definitions:\n` +
            `\`\`\`\n${validator.getSchemaText()}\`\`\`\n` +
            `The following is a user request:\n` +
            `"""\n${request}\n"""\n` +
            `The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:\n`;
    }

    function createRepairPrompt(validationError: string) {
        return `The JSON object is invalid for the following reason:\n` +
            `"""\n${validationError}\n"""\n` +
            `The following is a revised JSON object:\n`;
    }

    async function translate(request: string, promptPreamble?: string | PromptSection[]): Promise<Result<T>> {
        const schemaValidator = validator as TypeChatJsonValidator<T> &
            Partial<Pick<TypeChatJsonValidatorWithSchemaValidation<T>, typeof typeChatSchemaValidation>>;
        const preflight = schemaValidator[typeChatSchemaValidation]?.();
        if (preflight && !preflight.success) {
            return error(`Schema validation failed before model request: ${preflight.message}`);
        }
        const preamble: PromptSection[] = typeof promptPreamble === "string" ? [{ role: "user", content: promptPreamble }] : promptPreamble ?? [];
        if (promptLayout !== "legacy" && typeChat.createRequestPrompt !== createRequestPrompt) {
            return error('A custom createRequestPrompt requires { promptLayout: "legacy" }. To migrate, move application instructions to createSystemPrompt() and pass context as promptPreamble.');
        }
        const prompt: PromptSection[] = promptLayout === "legacy"
            ? [...preamble, { role: "user", content: typeChat.createRequestPrompt(request) }]
            : [{ role: "system", content: typeChat.createSystemPrompt() }, ...preamble, { role: "user", content: request }];
        let attemptRepair = typeChat.attemptRepair;
        let failureContext: (Pick<TypeChatError, "data"> & { responseText: string }) | undefined;
        const responses: TypeChatResponseMetadata[] = [];
        const finish = (result: Result<T>) => withResponseMetadata(result, responses);
        while (true) {
            const response = await model.complete(prompt);
            responses.push(...(response.metadata?.responses ?? [{}]));
            if (!response.success) {
                return finish(failureContext ? {
                    ...failureContext,
                    ...response,
                    success: false,
                    message: response.message,
                    ...("data" in response ? { data: response.data } : {}),
                    responseText: response.responseText ?? failureContext.responseText
                } : response);
            }
            const responseText = response.data;
            failureContext = { ...failureContext, responseText };
            const startIndex = responseText.indexOf("{");
            const endIndex = responseText.lastIndexOf("}");
            const jsonText = startIndex >= 0 && endIndex > startIndex ? responseText.slice(startIndex, endIndex + 1) : undefined;
            let parsed = false;
            let jsonObject: object = {};
            let failure: (TypeChatError & { responseText: string }) | undefined;
            if (!jsonText) {
                failure = { ...error(`Response is not JSON:\n${responseText}`, failureContext), responseText };
            }
            else {
                try {
                    jsonObject = JSON.parse(jsonText) as object;
                    parsed = true;
                }
                catch (e) {
                    failure = { ...error(e instanceof SyntaxError ? e.message : "JSON parse error", failureContext), responseText };
                }
            }
            if (parsed) {
                if (typeChat.stripNulls) {
                    stripNulls(jsonObject);
                }
                const schemaValidation = validator.validate(jsonObject);
                const validation = schemaValidation.success ? typeChat.validateInstance(schemaValidation.data) : schemaValidation;
                if (validation.success) {
                    return finish(validation);
                }
                failure = {
                    ...validation,
                    success: false,
                    message: validation.message,
                    data: "data" in validation ? validation.data : schemaValidation.success ? schemaValidation.data : jsonObject,
                    responseText: validation.responseText ?? responseText
                };
                if (!attemptRepair) {
                    return finish({ ...failure, message: `JSON validation failed: ${failure.message}\n${jsonText}` });
                }
            }
            else if (!attemptRepair) {
                return finish(failure!);
            }
            failureContext = {
                ...("data" in failure! ? { data: failure!.data } : {}),
                responseText: failure!.responseText
            };
            prompt.push({ role: "assistant", content: responseText });
            prompt.push({ role: "user", content: typeChat.createRepairPrompt(failure!.message) });
            attemptRepair = false;
        }
    }
}

/**
 * Recursively delete properties with null values from the given object. This function assumes there are no
 * circular references in the object.
 * @param obj The object in which to strip null valued properties.
 */
function stripNulls(obj: any) {
    let keysToDelete: string[] | undefined;
    for (const k in obj) {
        let value = obj[k];
        if (value === null) {
            (keysToDelete ??= []).push(k);
        }
        else {
            if (Array.isArray(value)) {
                if (value.some(x => x === null)) {
                    value = obj[k] = value.filter(x => x !== null);
                }
            }
            if (typeof value === "object") {
                stripNulls(value);
            }
        }
    }
    if (keysToDelete) {
        for (const k of keysToDelete) {
            delete obj[k];
        }
    }
}
