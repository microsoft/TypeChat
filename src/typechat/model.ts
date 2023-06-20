import process from "process";
import axios from "axios";
import { Response, success, error } from "./response";

const retryMaxAttempts = 3;
const retryPauseMs = 1000;

export interface TypeChatLanguageModel {
    complete(prompt: string): Promise<Response<string>>;
}

export function createLanguageModel(): TypeChatLanguageModel {
    return process.env.OPENAI_API_KEY ? createOpenAILanguageModel() :
        process.env.AZURE_API_KEY ? createAzureOpenAILanguageModel() :
        missingEnvironmentVariable("OPENAI_API_KEY or AZURE_API_KEY");
}

export function createOpenAILanguageModel(endPoint?: string, model?: string, apiKey?: string): TypeChatLanguageModel {
    const effectiveApiKey = apiKey ?? process.env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
    const effectiveEndPoint = endPoint ?? process.env.OPENAI_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
    const effectiveModel = model ?? process.env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
    return createAxiosLanguageModel(effectiveEndPoint, { headers: { Authorization: `Bearer ${effectiveApiKey}` } }, { model: effectiveModel });
}

export function createAzureOpenAILanguageModel(endPoint?: string, apiKey?: string): TypeChatLanguageModel {
    const effectiveApiKey = apiKey ?? process.env.AZURE_API_KEY ?? missingEnvironmentVariable("AZURE_API_KEY");
    const effectiveEndPoint = endPoint ?? process.env.AZURE_OPENAI_ENDPOINT ?? missingEnvironmentVariable("AZURE_OPENAI_ENDPOINT");
    return createAxiosLanguageModel(effectiveEndPoint, { headers: { "api-key": effectiveApiKey } }, {});
}

function createAxiosLanguageModel(url: string, config: object, defaultParams: Record<string, string>) {
    const client = axios.create(config);
    return {
        complete
    };

    async function complete(prompt: string) {
        let retryCount = 0;
        while (true) {
            const params = {
                ...defaultParams,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.05,
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

function isTransientHttpError(code: number): boolean {
    switch (code) {
        case 429: // TooManyRequests
        case 500: //InternalServerError
        case 502: // BadGateway
        case 503: // ServiceUnavailable
        case 504: // GatewayTimeout
            return true;
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function missingEnvironmentVariable(name: string): never {
    throw new Error(`"Missing environment variable: ${name}`);
}

// export function createOpenAILanguageModel(model?: string, apiKey?: string): TypeChatLanguageModel {
//     const effectiveApiKey = apiKey ?? process.env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
//     const effectiveModel = model ?? process.env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
//     const configuration = new oai.Configuration({ apiKey: effectiveApiKey });
//     const api = new oai.OpenAIApi(configuration);
//     return {
//         complete
//     };

//     async function complete(prompt: string) {
//         const request: oai.CreateChatCompletionRequest = {
//             model: effectiveModel,
//             messages: [{ role: "user", content: prompt }],
//             temperature: 0.05,
//             n: 1
//         };
//         const completion = await api.createChatCompletion(request);
//         if (completion.status !== 200) {
//             error(`OpenAI error ${completion.status}: ${completion.statusText}`);
//         }
//         return completion.data.choices[0].message?.content ?? "";
//     }
// }

// export function createAzureOpenAILanguageModel(endPoint?: string, deploymentName?: string, apiKey?: string): TypeChatLanguageModel {
//     const effectiveApiKey = apiKey ?? process.env.AZURE_API_KEY ?? missingEnvironmentVariable("AZURE_API_KEY");
//     const effectiveEndPoint = endPoint ?? process.env.AZURE_OPENAI_ENDPOINT ?? missingEnvironmentVariable("AZURE_OPENAI_ENDPOINT");
//     const effectiveDeploymentName = deploymentName ?? process.env.AZURE_DEPLOYMENT_NAME ?? missingEnvironmentVariable("AZURE_DEPLOYMENT_NAME");
//     const client = new azure.OpenAIClient(effectiveEndPoint, new azure.AzureKeyCredential(effectiveApiKey));
//     return {
//         complete
//     };

//     async function complete(prompt: string) {
//         const options: azure.GetChatCompletionsOptions = {
//             temperature: 0.05,
//             n: 1
//         };
//         const completions = await client.getChatCompletions(effectiveDeploymentName, [{ role: "user", content: prompt }], options);
//         return completions.choices[0].message?.content ?? "";
//     }
// }
