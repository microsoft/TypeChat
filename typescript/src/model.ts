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
    content: PromptContent;
}

export type PromptContent =
    | string
    | MultimodalPromptContent[];

/**
 * GPT-4-vision, GPT-4-omni and GPT-4-turbo allow multi-modal input, where images and text can
 * be part of the prompt. To support this, the content section of the prompt has an array of objects.
 */
export type MultimodalPromptContent =
    | string
    | TextPromptContent
    | ImagePromptContent;

export type TextPromptContent = {
    type: "text";
    text: string;
};

export type ImagePromptContent = {
    type: "image_url";
    image_url: ImageUrl;
};

export type ImageUrl = {
    /*
     * This could be a URL to a hosted image, or the base64-encoded image content.
     */
    url: string;
    
    /*
     * Controls how the model processes the image and generates its textual understanding.
     * In "low" mode, the model treats the image as 512x512px, while "high" mode considers
     * the image at full size.
     */
    detail?: "auto" | "low" | "high";
};

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

/**
 * Optional settings accepted by the language model factory functions.
 */
export interface LanguageModelOptions {
    /**
     * URL of an HTTP or HTTPS proxy to route model requests through
     * (for example `"http://127.0.0.1:7890"`). This is useful in environments where the model
     * endpoint can only be reached via a proxy.
     *
     * Requests are dispatched through the proxy using an `undici` `ProxyAgent`. `undici` is an
     * optional dependency that is imported only when a proxy is configured; install it with
     * `npm install undici`.
     *
     * When you use {@link createLanguageModel}, proxy configuration is read automatically from the
     * standard `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` environment variables, and `NO_PROXY` is
     * honored, so setting those (e.g. in a `.env` file) is usually all that is required.
     */
    proxyUrl?: string;

    /**
     * Selects the OpenAI API variant. When `true`, the Responses API (`/v1/responses`) is used
     * regardless of the endpoint URL; when `false`, the Chat Completions API is used. When omitted
     * (default), the variant is inferred from the endpoint URL (a path ending in `/responses`
     * selects the Responses API). Only applies to `createOpenAILanguageModel`.
     */
    useResponsesApi?: boolean;
}

/**
 * Internal proxy configuration threaded to the fetch helpers.
 * - `url`: an explicit proxy URL supplied via {@link LanguageModelOptions.proxyUrl}.
 * - `env`: values collected from the standard proxy environment variables, applied per request by
 *   an `undici` `EnvHttpProxyAgent` (which also honors `NO_PROXY` and the http/https split).
 */
type ProxySettings =
    | { kind: "url"; url: string }
    | { kind: "env"; httpProxy: string | undefined; httpsProxy: string | undefined; noProxy: string | undefined };

/**
 * {@link LanguageModelOptions} plus internal, pre-resolved proxy settings passed down by
 * {@link createLanguageModel}. Not part of the public API.
 */
interface InternalModelOptions extends LanguageModelOptions {
    proxy?: ProxySettings;
}

/**
 * Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
 * chosen by environment variables.
 *
 * If an `OPENAI_API_KEY` environment variable exists, the `createOpenAILanguageModel` function
 * is used to create the instance. The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables
 * must also be defined or an exception will be thrown.
 * To use the OpenAI Responses API, set `OPENAI_ENDPOINT` to a URL whose path ends with `/responses`
 * (e.g. `https://api.openai.com/v1/responses`); otherwise the Chat Completions API is used.
 *
 * If an `AZURE_OPENAI_API_KEY` environment variable exists, the `createAzureOpenAILanguageModel` function
 * is used to create the instance. The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined
 * or an exception will be thrown.
 *
 * If none of these key variables are defined, an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createLanguageModel(env: Record<string, string | undefined>): TypeChatLanguageModel {
    const proxy = proxySettingsFromEnv(env);
    const options: InternalModelOptions | undefined = proxy ? { proxy } : undefined;
    if (env.OPENAI_API_KEY) {
        const apiKey = env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
        const model = env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
        const org = env.OPENAI_ORGANIZATION ?? "";
        const endPoint = env.OPENAI_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
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
 *
 * When `endPoint` (or `options.useResponsesApi`) indicates the Responses API the function routes through
 * the `/v1/responses` request/response format; otherwise the Chat Completions format is used.
 * The Responses API is auto-detected when the endpoint URL path ends with `/responses`
 * (e.g. `https://api.openai.com/v1/responses`).
 * @param apiKey The OpenAI API key.
 * @param model The model name (e.g. `"gpt-4o"`).
 * @param endPoint The URL of the OpenAI REST API endpoint. Defaults to
 *   `"https://api.openai.com/v1/chat/completions"`. Supply a `/responses` URL to use the
 *   Responses API instead.
 * @param org The OpenAI organization id.
 * @param options Optional settings such as a proxy URL or the API variant to use.
 *   See {@link LanguageModelOptions}.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createOpenAILanguageModel(apiKey: string, model: string, endPoint = "https://api.openai.com/v1/chat/completions", org = "", options?: LanguageModelOptions): TypeChatLanguageModel {
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Organization": org
    };
    const proxy = resolveProxySettings(options);
    if ((options?.useResponsesApi ?? isResponsesApiUrl(endPoint))) {
        return createResponsesFetchLanguageModel(endPoint, headers, { model }, proxy);
    }
    return createFetchLanguageModel(endPoint, headers, { model }, proxy);
}

/**
 * Creates a language model encapsulation of an Azure OpenAI REST API endpoint.
 * @param endPoint The URL of the OpenAI REST API endpoint. The URL must be in the format
 *   "https://{your-resource-name}.openai.azure.com/openai/deployments/{your-deployment-name}/chat/completions?api-version={API-version}".
 *   Example deployment names are "gpt-35-turbo" and "gpt-4". An example API versions is "2023-05-15".
 * @param apiKey The Azure OpenAI API key.
 * @param options Optional settings such as a proxy URL. See {@link LanguageModelOptions}.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createAzureOpenAILanguageModel(apiKey: string, endPoint: string, options?: LanguageModelOptions): TypeChatLanguageModel {
    const headers = {
        // Needed when using managed identity
        "Authorization": `Bearer ${apiKey}`,
        // Needed when using regular API key
        "api-key": apiKey
    };
    return createFetchLanguageModel(endPoint, headers, {}, resolveProxySettings(options));
}

/**
 * Common OpenAI REST API endpoint encapsulation using the fetch API.
 */
function createFetchLanguageModel(url: string, headers: object, defaultParams: object, proxy?: ProxySettings) {
    let dispatcherPromise: Promise<RequestInit["dispatcher"]> | undefined;
    const model: TypeChatLanguageModel = {
        complete
    };
    return model;

    async function complete(prompt: string | PromptSection[]) {
        dispatcherPromise ??= resolveProxyDispatcher(proxy);
        const dispatcher = await dispatcherPromise;
        let retryCount = 0;
        const retryMaxAttempts = model.retryMaxAttempts ?? 3;
        const retryPauseMs = model.retryPauseMs ?? 1000;
        const messages = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
        while (true) {
            const options: RequestInit = {
                method: "POST",
                body: JSON.stringify({
                    ...defaultParams,
                    messages,
                    temperature: 0,
                    n: 1
                }),
                headers: {
                    "content-type": "application/json",
                    ...headers
                }
            };
            if (dispatcher) {
                options.dispatcher = dispatcher;
            }
            const response = await fetch(url, options);
            if (response.ok) {
                const json = await response.json() as { choices: { message: PromptSection }[] };
                if (typeof json.choices[0].message.content === "string") {
                    return success(json.choices[0].message.content ?? "");
                } else {
                    return error(`REST API unexpected response format: ${JSON.stringify(json.choices[0].message.content)}`);
                }
            }
            if (!isTransientHttpError(response.status) || retryCount >= retryMaxAttempts) {
                return error(`REST API error ${response.status}: ${response.statusText}`);
            }
            await sleep(getRetryDelayMs(response, retryPauseMs, retryPauseMs * retryMaxAttempts));
            retryCount++;
        }
    }
}

/**
 * OpenAI Responses API endpoint encapsulation using the fetch API.
 *
 * The Responses API uses a different request and response shape from Chat Completions:
 * - **Request body**: `input` (string or array of `PromptSection`) instead of `messages`.
 * - **Response body**: text is returned inside `output[n].content[m].text` where the matching
 *   output item has `type === "message"` and the content item has `type === "output_text"`.
 *
 * Example successful response:
 * ```json
 * {
 *   "id": "resp_...",
 *   "output": [
 *     {
 *       "type": "message",
 *       "role": "assistant",
 *       "content": [{ "type": "output_text", "text": "Hello!" }]
 *     }
 *   ]
 * }
 * ```
 *
 * @param url The Responses API endpoint URL (path should end with `/responses`).
 * @param headers HTTP headers to include in every request (e.g. `Authorization`).
 * @param defaultParams Additional JSON body parameters merged into every request (e.g. `{ model }`).
 */
function createResponsesFetchLanguageModel(url: string, headers: object, defaultParams: object, proxy?: ProxySettings) {
    let dispatcherPromise: Promise<RequestInit["dispatcher"]> | undefined;
    const model: TypeChatLanguageModel = {
        complete
    };
    return model;

    async function complete(prompt: string | PromptSection[]) {
        dispatcherPromise ??= resolveProxyDispatcher(proxy);
        const dispatcher = await dispatcherPromise;
        let retryCount = 0;
        const retryMaxAttempts = model.retryMaxAttempts ?? 3;
        const retryPauseMs = model.retryPauseMs ?? 1000;
        const input = typeof prompt === "string" ? prompt : (prompt as PromptSection[]);
        while (true) {
            const options: RequestInit = {
                method: "POST",
                body: JSON.stringify({
                    ...defaultParams,
                    input,
                    temperature: 0,
                }),
                headers: {
                    "content-type": "application/json",
                    ...headers
                }
            };
            if (dispatcher) {
                options.dispatcher = dispatcher;
            }
            const response = await fetch(url, options);
            if (response.ok) {
                type ResponsesAPIOutputItem = {
                    type: string;
                    role?: string;
                    content: { type: string; text: string }[];
                };
                const json = await response.json() as { output: ResponsesAPIOutputItem[] };
                const message = json.output?.find(o => o.type === "message");
                const textContent = message?.content?.find(c => c.type === "output_text");
                if (textContent?.text !== undefined) {
                    return success(textContent.text);
                } else {
                    return error(`REST API unexpected response format: ${JSON.stringify(json)}`);
                }
            }
            if (!isTransientHttpError(response.status) || retryCount >= retryMaxAttempts) {
                return error(`REST API error ${response.status}: ${response.statusText}`);
            }
            await sleep(getRetryDelayMs(response, retryPauseMs, retryPauseMs * retryMaxAttempts));
            retryCount++;
        }
    }
}

/**
 * Returns the number of milliseconds to wait before the next retry attempt.
 * When the response carries a `Retry-After` header (sent by servers on 429 Too Many Requests
 * and 503 Service Unavailable), its value (in seconds) is used as the delay, capped at
 * `maxMs` to avoid waiting longer than the configured total retry budget.
 * For all other transient errors the default pause is returned.
 */
function getRetryDelayMs(response: Response, defaultMs: number, maxMs: number): number {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
            return Math.min(seconds * 1000, maxMs);
        }
    }
    return defaultMs;
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
 * Returns true when the given URL targets the OpenAI Responses API.
 * Detection is based on whether the URL path ends with `/responses` (before any query string).
 * This covers both the standard OpenAI endpoint (`https://api.openai.com/v1/responses`) and
 * Azure OpenAI deployments that end with `/responses?api-version=...`.
 */
function isResponsesApiUrl(url: string): boolean {
    try {
        return new URL(url).pathname.endsWith("/responses");
    } catch {
        // Fallback for relative or non-standard URLs
        return url.split("?")[0].endsWith("/responses");
    }
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collects proxy configuration from the standard proxy environment variables, or returns
 * `undefined` when none are set. `HTTPS_PROXY`/`HTTP_PROXY` select the proxy per request protocol,
 * `ALL_PROXY` is the fallback for both, and `NO_PROXY` lists hosts that bypass the proxy. Both
 * upper- and lower-case names are recognized; matching is applied per request by an
 * `EnvHttpProxyAgent`.
 */
function proxySettingsFromEnv(env: Record<string, string | undefined>): ProxySettings | undefined {
    const allProxy = env.ALL_PROXY ?? env.all_proxy;
    const httpsProxy = env.HTTPS_PROXY ?? env.https_proxy ?? allProxy;
    const httpProxy = env.HTTP_PROXY ?? env.http_proxy ?? allProxy;
    if (!httpsProxy && !httpProxy) {
        return undefined;
    }
    return { kind: "env", httpProxy, httpsProxy, noProxy: env.NO_PROXY ?? env.no_proxy };
}

/**
 * Resolves the {@link ProxySettings} for a set of options: an explicit `proxyUrl` becomes a
 * single-URL proxy, while {@link createLanguageModel} passes pre-resolved environment settings.
 */
function resolveProxySettings(options: LanguageModelOptions | undefined): ProxySettings | undefined {
    const internal = options as InternalModelOptions | undefined;
    if (internal?.proxy) {
        return internal.proxy;
    }
    if (options?.proxyUrl) {
        return { kind: "url", url: options.proxyUrl };
    }
    return undefined;
}

/**
 * Dynamically imports the optional `undici` package, translating a missing-module error into an
 * actionable message. `undici` also powers Node's built-in `fetch`, so it is the natural choice for
 * proxy dispatching and is imported only when a proxy is actually configured.
 */
async function importUndici() {
    try {
        return await import("undici");
    } catch (e) {
        if (e instanceof Error && /Cannot find module|ERR_MODULE_NOT_FOUND/.test(e.message)) {
            throw new Error(
                `A proxy was configured, but the optional "undici" package is not installed. ` +
                `Run "npm install undici" to enable proxy support.`
            );
        }
        throw e;
    }
}

/**
 * Lazily constructs an `undici` dispatcher for the given proxy settings, or returns `undefined`
 * when no proxy is configured. Absent settings are a no-op, so an agent is never accidentally
 * constructed from an empty proxy string. Node's `fetch` honors an undici `dispatcher` per request.
 */
async function resolveProxyDispatcher(proxy: ProxySettings | undefined): Promise<RequestInit["dispatcher"]> {
    if (!proxy) {
        return undefined;
    }
    const { ProxyAgent, EnvHttpProxyAgent } = await importUndici();
    // `undici` bundles its own dispatcher types, which are structurally identical to the
    // `undici-types` copy that Node's global `fetch`/`RequestInit` use but nominally distinct;
    // bridge the two with a cast.
    if (proxy.kind === "url") {
        return new ProxyAgent(proxy.url) as unknown as RequestInit["dispatcher"];
    }
    // Env-driven: EnvHttpProxyAgent applies NO_PROXY and the http/https split per request.
    const envOptions = {
        ...(proxy.httpProxy ? { httpProxy: proxy.httpProxy } : {}),
        ...(proxy.httpsProxy ? { httpsProxy: proxy.httpsProxy } : {}),
        ...(proxy.noProxy ? { noProxy: proxy.noProxy } : {})
    };
    return new EnvHttpProxyAgent(envOptions) as unknown as RequestInit["dispatcher"];
}

/**
 * Throws an exception for a missing environment variable.
 */
function missingEnvironmentVariable(name: string): never {
    throw new Error(`Missing environment variable: ${name}`);
}
