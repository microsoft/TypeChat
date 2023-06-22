import process from "process";
import axios from "axios";
import { Result, success, error } from "./result";

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
     * @param prompt The prompt string.
     */
    complete(prompt: string): Promise<Result<string>>;
}

/**
 * Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
 * chosen by environment variables. If an `OPENAI_API_KEY` environment variable exists, the
 * `createOpenAILanguageModel` function is used to create the instance. If an `AZURE_API_KEY` environment
 * variable exists, the `createAzureOpenAILanguageModel` function is used to create the instance.
 * Otherwise, an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createLanguageModel(): TypeChatLanguageModel {
    return process.env.OPENAI_API_KEY ? createOpenAILanguageModel() :
        process.env.AZURE_API_KEY ? createAzureOpenAILanguageModel() :
        missingEnvironmentVariable("OPENAI_API_KEY or AZURE_API_KEY");
}

/**
 * Creates a language model encapsulation of an OpenAI REST API endpoint.
 * @param endPoint The URL of the OpenAI REST API endpoint. Defaults to "https://api.openai.com/v1/chat/completions".
 * @param model The model name. If not specified, the model name is obtained from the `OPENAI_MODEL` environment
 *   variable if it exists, or otherwise an exception is thrown.
 * @param apiKey The OpenAI API key. If not specified, the API key is obtained from the `OPENAI_API_KEY` environment
 *   variable if it exists, or otherwise an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createOpenAILanguageModel(endPoint?: string, model?: string, apiKey?: string): TypeChatLanguageModel {
    const effectiveApiKey = apiKey ?? process.env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
    const effectiveEndPoint = endPoint ?? process.env.OPENAI_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
    const effectiveModel = model ?? process.env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
    return createAxiosLanguageModel(effectiveEndPoint, { headers: { Authorization: `Bearer ${effectiveApiKey}` } }, { model: effectiveModel });
}

/**
 * Creates a language model encapsulation of an Azure OpenAI REST API endpoint.
 * @param endPoint The URL of the OpenAI REST API endpoint. If not specified, the URL is obtained from the
 *   `AZURE_ENDPOINT` environment variable if it exists, or otherwise an exception is thrown. The URL must be in the format
 *   "https://{your-resource-name}.openai.azure.com/openai/deployments/{your-deployment-name}/chat/completions?api-version={API-version}".
 *   Example deployment names are "gpt-35-turbo" and "gpt-4". An example API versions is "2023-05-15".
 * @param apiKey The Azure API key. If not specified, the API key is obtained from the `AZURE_API_KEY` environment
 *   variable if it exists, or otherwise an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createAzureOpenAILanguageModel(endPoint?: string, apiKey?: string): TypeChatLanguageModel {
    const effectiveApiKey = apiKey ?? process.env.AZURE_API_KEY ?? missingEnvironmentVariable("AZURE_API_KEY");
    const effectiveEndPoint = endPoint ?? process.env.AZURE_OPENAI_ENDPOINT ?? missingEnvironmentVariable("AZURE_OPENAI_ENDPOINT");
    return createAxiosLanguageModel(effectiveEndPoint, { headers: { "api-key": effectiveApiKey } }, {});
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

    async function complete(prompt: string) {
        let retryCount = 0;
        const retryMaxAttempts = model.retryMaxAttempts ?? 3;
        const retryPauseMs = model.retryPauseMs ?? 1000;
        while (true) {
            const params = {
                ...defaultParams,
                messages: [{ role: "user", content: prompt }],
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
    throw new Error(`"Missing environment variable: ${name}`);
}
