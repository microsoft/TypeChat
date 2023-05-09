/* eslint-disable prettier/prettier */
// (c) Copyright Microsoft Corp

import * as oai from 'azure-openai';
import { Exception, Validator, strEqInsensitive } from './core';
import * as retry from './retry';
import { TypechatErrorCode, TypechatException } from './typechatException';

/**
 * Types of models we work with
 */
export enum ModelType {
    Completion = 'completion',
    Embedding = 'embedding',
    Chat = 'chat',
    Image = 'image',
}
/**
 * Names of standard models
 */
export enum ModelNames {
    Text_Davinci_002 = 'text-davinci-002',
    // Davinci_3 is from the Gpt 3.5 family, not GPT 4
    Text_Davinci_003 = 'text-davinci-003',
    Text_Embedding_Ada2 = 'text-embedding-ada-002',
    Gpt35Turbo = 'gpt-3.5-turbo',
    AzureDV3 = 'azure-dv3', // Pre-release GPT4
    Gpt4 = 'gpt4',
}
/**
 * General model information, like token budgets, tokenizer to use,etc.
 */
export type ModelInfo = {
    name: string;
    type: ModelType;
    maxTokenLength: number;
    embeddingSize?: number;
    // Tokenizer: Add a function to the tokenizer here
    // We will use that to estimate token budgets etc.
};

/**
 * A table of model information
 * This is hard-codded for the short term.
 * Future: pull directly from the OAI service.
 */
export const Models: ModelInfo[] = [
    {
        name: ModelNames.Text_Davinci_002,
        maxTokenLength: 4096,
        type: ModelType.Completion,
    },
    {
        name: ModelNames.Text_Davinci_003,
        maxTokenLength: 4096,
        type: ModelType.Completion,
    },
    {
        name: ModelNames.AzureDV3,
        maxTokenLength: 4096,
        type: ModelType.Completion,
    },
    {
        name: ModelNames.Text_Embedding_Ada2,
        maxTokenLength: 8191,
        type: ModelType.Embedding,
        embeddingSize: 1536,
    },
    {
        name: ModelNames.Gpt4,
        maxTokenLength: 8192,
        type: ModelType.Chat,
    },
    {
        name: ModelNames.Gpt35Turbo,
        maxTokenLength: 4096,
        type: ModelType.Chat,
    },
];

function findModel(name: string): ModelInfo | undefined {
    return Models.find((m) => strEqInsensitive(m.name, name));
}

/**
 * Settings to use with the AzureOAIClient
 * These settings can be loaded from config
 */
export type AzureOAIModel = {
    modelName: string;
    deployment: string;
    type?: ModelType;
    // Other flags and properties may go here.
};
function validateAzureOAIModel(settings: AzureOAIModel): void {
    Validator.notEmpty(settings.modelName, 'modelName');
    Validator.notEmpty(settings.deployment, 'deployment');
}

/**
 * Settings to use with the AzureOAIClient
 * These settings are typically loaded from config
 */
export type AzureOAISettings = {
    apiKey: string;
    endpoint: string;
    models: AzureOAIModel[]; // Models available at this endpoint
};

export function validateAzureOAISettings(settings: AzureOAISettings): void {
    Validator.notEmpty(settings.apiKey, 'apiKey');
    Validator.notEmpty(settings.endpoint, 'endpoint');
    Validator.notEmpty(settings.models, 'models');
    Validator.validate(settings.models, validateAzureOAIModel);
}

export class AzureOAIException extends Exception<number> {
    constructor(statusCode: number, message?: string) {
        super(statusCode, message);
    }
}

/**
 * OpenAIClient with:
 *   Built in retry around transient errors
 *   Wrapper APIs for common scenarios
 */
export class AzureOAIClient {
    private _apiSettings: AzureOAISettings;
    private _models: AzureOAIModels;
    private _retrySettings: retry.RetrySettings;
    private _client: oai.OpenAIApi;

    constructor(
        apiSettings: AzureOAISettings,
        retrySettings?: retry.RetrySettings
    ) {
        validateAzureOAISettings(apiSettings);
        this._apiSettings = apiSettings;
        this._models = new AzureOAIModels(apiSettings.models);
        this._client = createClient(apiSettings.apiKey, apiSettings.endpoint);
        if (retrySettings) {
            this._retrySettings = retrySettings;
        } else {
            this._retrySettings = {
                maxAttempts: 5,
                retryPauseMS: 1000,
            };
        }
    }

    /**
     * Get a single completion for the given prompt. A simple method that includes the most common parameters
     * we use. And will use the right completion API underneath - since newer models use the 'chat' mechanism.
     * @param prompt The prompt to complete
     * @param maxTokens Max tokens to generate
     * @param temperature Temperature to use.
     * @param stop Stop sequences
     * @returns The completion from the AI
     */
    public async getCompletion(
        prompt: string,
        model: string | AzureOAIModel,
        maxTokens?: number,
        temperature?: number,
        stop?: string[]
    ): Promise<string> {
        let azureModel: AzureOAIModel;
        let modelName: string;
        if (typeof model === 'string') {
            Validator.notEmpty(model, 'model');
            modelName = model as string;
            azureModel = this.resolveModel(modelName);
        } else {
            azureModel = model as AzureOAIModel;
            modelName = azureModel.modelName;
        }
        // Completion and Chat models have different APIs! Older models have older APIs.
        if (azureModel.type === ModelType.Completion) {
            const request: oai.CreateCompletionRequest = {
                model: azureModel.deployment,
                prompt: prompt,
                max_tokens: maxTokens,
                temperature: temperature,
                stop: stop,
            };
            return this.firstCompletion(await this.createCompletion(request));
        } else if (azureModel.type === ModelType.Chat) {
            const request: oai.CreateChatCompletionRequest = {
                model: azureModel.deployment,
                messages: [
                    {
                        role: oai.ChatCompletionRequestMessageRoleEnum.User,
                        content: prompt,
                    },
                ],
                max_tokens: maxTokens,
                temperature: temperature,
            };
            return this.firstChatCompletion(
                await this.createChatCompletion(request)
            );
        }
        throw new TypechatException(
            TypechatErrorCode.ModelDoesNotSupportCompletion,
            modelName
        );
    }

    /**
     * Get a completion from the AI - with automatic retries
     * @param request CreateCompletionRequest
     * @returns List of completions generated by the AI
     */
    public async createCompletion(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>> {
        return this.executeWithRetry(() => this.createCompletionAttempt(request));
    }

    /**
     * Get a chat completion from the AI - with automatic retries
     * @param request CreateChatCompletionRequest
     * @returns Chat completion
     */
    public createChatCompletion(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>> {
        return this.executeWithRetry(() => this.createChatCompletionAttempt(request));
    }

    /**
     * Create an embedding
     * @param text Create an embedding for this text
     * @param modelName Using this model
     * @returns embedding
     */
    public createEmbedding(
        text: string,
        modelName: string
    ): Promise<number[]> {
        Validator.notEmpty(text, 'text');

        const model = this.resolveModel(modelName);
        if (model.type !== ModelType.Embedding) {
            throw new TypechatException(
                TypechatErrorCode.ModelDoesNotSupportEmbeddings,
                modelName
            );
        }
        const request: oai.CreateEmbeddingRequest = {
            model: modelName,
            input: [text],
        };
        return this.executeWithRetry(() => this.createEmbeddingAttempt(request));
    }

    /**
     * Create embeddings
     * @param texts Create embeddings for these texts
     * @param modelName Using this model
     * @returns A collection of embeddings
     */
    public async createEmbeddings(
        texts: string[],
        modelName: string
    ): Promise<number[][]> {

        // Azure OAI is currently only allowing 1 embedding at a time.
        // Even though the API allows batching
        // So we have to do this in a loop for now.
        const embeddings: number[][] = new Array(texts.length);
        for (let i = 0; i < texts.length; ++i) {
            embeddings[i] = await this.createEmbedding(texts[i], modelName);
        }
        return embeddings;
    }

    private async createCompletionAttempt(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>> {
        const response = await this._client.createCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    private async createChatCompletionAttempt(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>> {
        const response = await this._client.createChatCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    private async createEmbeddingAttempt(
        request: oai.CreateEmbeddingRequest
    ): Promise<number[]> {
        const response = await this._client.createEmbedding(request);
        this.ensureSuccess(response);
        return this.firstEmbedding(response.data);
    }

    private firstCompletion(
        choices: Array<oai.CreateCompletionResponseChoicesInner>
    ): string {
        let text = choices[0].text;
        if (!text) {
            text = '';
        }
        return text;
    }

    private firstChatCompletion(
        choices: Array<oai.CreateChatCompletionResponseChoicesInner>
    ): string {
        let text = choices[0].message?.content;
        if (!text) {
            text = '';
        }
        return text;
    }

    private firstEmbedding(response: oai.CreateEmbeddingResponse): number[] {
        const data = response.data;
        return data[0].embedding;
    }

    private executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        return  retry.executeWithRetry(
            this._retrySettings,
            fn,
            this.isTransientError
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private ensureSuccess(response: any) {
        if (response.status !== 200) {
            throw new AzureOAIException(response.status, response.statusText);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isTransientError(e: any): boolean {
        if (e.response) {
            return retry.isTransientHttpError(e.response.status);
        }
        if (e.status) {
            return retry.isTransientHttpError(e.status);
        }
        if (e instanceof AzureOAIException) {
            return retry.isTransientHttpError(
                (e as AzureOAIException).errorCode
            );
        }
        return false;
    }

    private resolveModel(modelName: string): AzureOAIModel {
        const azureModel = this._models.getByName(modelName);
        if (azureModel === undefined) {
            throw new TypechatException(
                TypechatErrorCode.ModelNotFound,
                modelName
            );
        }
        return azureModel;
    }
}

export class AzureOAIModels {
    private _models: AzureOAIModel[];

    constructor(models: AzureOAIModel[]) {
        this._models = models;
        this.updateModelInfo();
    }

    public getByName(name: string): AzureOAIModel | undefined {
        return this._models.find((m) => m.modelName === name);
    }
    public getByType(type: ModelType): AzureOAIModel | undefined {
        return this._models.find((m) => m.type === type);
    }
    private updateModelInfo(): void {
        for (let i = 0; i < this._models.length; ++i) {
            if (!this._models[i].type) {
                const knownModel = findModel(this._models[i].modelName);
                if (knownModel !== undefined) {
                    this._models[i].type = knownModel.type;
                }
            }
        }
    }
}

function createClient(apiKey: string, endpoint: string): oai.OpenAIApi {
    const config: oai.Configuration = new oai.Configuration({
        apiKey: apiKey,
        azure: {
            apiKey: apiKey,
            endpoint: endpoint,
        },
    });
    const client: oai.OpenAIApi = new oai.OpenAIApi(config);
    return client;
}
