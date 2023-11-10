import axios, { CreateAxiosDefaults } from "axios";
import { Result, success, error } from "./result";

/**
 * Represents a section of an LLM prompt with an associated role. TypeChat uses the "user" role for
 * prompts it generates and the "assistant" role for previous LLM responses (which will be part of
 * the prompt in repair attempts). TypeChat currently doesn't use the "system" role.
 */
export interface PromptSection {
    /**
     * Specifies the role of this section.
     */
    role: "system" | "user" | "assistant";
    /**
     * Specifies the content of this section.
     */
    content: string;
}

/**
 * Represents a AI language model that can complete prompts. TypeChat uses an implementation of this
 * interface to communicate with an AI service that can translate natural language requests to JSON
 * instances according to a provided schema. The `createLanguageModel`, `createOpenAILanguageModel`,
 * and `createAzureOpenAILanguageModel` functions create instances of this interface.
 */
export interface TypeChatLanguageModel {
    /**
     * Optional property that specifies the maximum number of retry attempts (the default is 3).
     */
    retryMaxAttempts?: number;
    /**
     * Optional property that specifies the delay before retrying in milliseconds (the default is 1000ms).
     */
    retryPauseMs?: number;
    /**
     * Obtains a completion from the language model for the given prompt.
     * @param prompt A prompt string or an array of prompt sections. If a string is specified,
     *   it is converted into a single "user" role prompt section.
     */
    complete(prompt: string | PromptSection[]): Promise<Result<string>>;
}

interface Options {
    axiosConfg?: CreateAxiosDefaults
}
/**
 * Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
 * chosen by environment variables.
 *
 * If an `OPENAI_API_KEY` environment variable exists, the `createOpenAILanguageModel` function
 * is used to create the instance. The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables
 * must also be defined or an exception will be thrown.
 *
 * If an `AZURE_OPENAI_API_KEY` environment variable exists, the `createAzureOpenAILanguageModel` function
 * is used to create the instance. The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined
 * or an exception will be thrown.
 *
 * If none of these key variables are defined, an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createLanguageModel(env: Record<string, string | undefined>, options?: Options): TypeChatLanguageModel {
    if (env.OPENAI_API_KEY) {
        const apiKey = env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
        const model = env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
        const endPoint = env.OPENAI_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
        const org = env.OPENAI_ORGANIZATION ?? "";
        return createOpenAILanguageModel(apiKey, model, endPoint, org, options);
    }
    if (env.AZURE_OPENAI_API_KEY) {
        const apiKey = env.AZURE_OPENAI_API_KEY ?? missingEnvironmentVariable("AZURE_OPENAI_API_KEY");
        const endPoint = env.AZURE_OPENAI_ENDPOINT ?? missingEnvironmentVariable("AZURE_OPENAI_ENDPOINT");
        return createAzureOpenAILanguageModel(apiKey, endPoint, options);
    }
    missingEnvironmentVariable("OPENAI_API_KEY or AZURE_OPENAI_API_KEY");
}

/**
 * Creates a language model encapsulation of an OpenAI REST API endpoint.
 * @param apiKey The OpenAI API key.
 * @param model The model name.
 * @param endPoint The URL of the OpenAI REST API endpoint. Defaults to "https://api.openai.com/v1/chat/completions".
 * @param org The OpenAI organization id.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createOpenAILanguageModel(apiKey: string, model: string, endPoint = "https://api.openai.com/v1/chat/completions", org = "", options: Options = {}): TypeChatLanguageModel {
    return createAxiosLanguageModel(endPoint, Object.assign({
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Organization": org
        },
    }, options), { model });
}

/**
 * Creates a language model encapsulation of an Azure OpenAI REST API endpoint.
 * @param endPoint The URL of the OpenAI REST API endpoint. The URL must be in the format
 *   "https://{your-resource-name}.openai.azure.com/openai/deployments/{your-deployment-name}/chat/completions?api-version={API-version}".
 *   Example deployment names are "gpt-35-turbo" and "gpt-4". An example API versions is "2023-05-15".
 * @param apiKey The Azure OpenAI API key.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createAzureOpenAILanguageModel(apiKey: string, endPoint: string, options: Options = {}): TypeChatLanguageModel {
    return createAxiosLanguageModel(endPoint, Object.assign({ headers: { "api-key": apiKey } }, options), {});
}

/**
 * Common implementation of language model encapsulation of an OpenAI REST API endpoint.
 */
function createAxiosLanguageModel(url: string, config: object, defaultParams: Record<string, string>) {
    const client = axios.create(config);
    const model: TypeChatLanguageModel = {
        complete
    };
    return model;

    async function complete(prompt: string | PromptSection[]) {
        let retryCount = 0;
        const retryMaxAttempts = model.retryMaxAttempts ?? 3;
        const retryPauseMs = model.retryPauseMs ?? 1000;
        const messages = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
        while (true) {
            const params = {
                ...defaultParams,
                messages,
                temperature: 0,
                n: 1
            };
            const result = await client.post(url, params, { validateStatus: status => true });
            if (result.status === 200) {
                return success(result.data.choices[0].message?.content ?? "");
            }
            if (!isTransientHttpError(result.status) || retryCount >= retryMaxAttempts) {
                return error(`REST API error ${result.status}: ${result.statusText}`);
            }
            await sleep(retryPauseMs);
            retryCount++;
        }
    }
}

/**
 * Returns true of the given HTTP status code represents a transient error.
 */
function isTransientHttpError(code: number): boolean {
    switch (code) {
        case 429: // TooManyRequests
        case 500: // InternalServerError
        case 502: // BadGateway
        case 503: // ServiceUnavailable
        case 504: // GatewayTimeout
            return true;
    }
    return false;
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Throws an exception for a missing environment variable.
 */
function missingEnvironmentVariable(name: string): never {
    throw new Error(`Missing environment variable: ${name}`);
}
