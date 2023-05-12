/* eslint-disable prettier/prettier */
// (c) Copyright Microsoft Corp

// Two separate oai libraries here. Nearly the same though
import * as aoai from 'azure-openai';
import * as oai from 'openai'
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
    DV3 = 'dv3', // Pre-release GPT4, also called dv3. Obsolete.
    Gpt4 = 'gpt-4',
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
        name: ModelNames.DV3,
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

export class OpenAIException extends Exception<number> {
    constructor(statusCode: number, message?: string) {
        super(statusCode, message);
    }
}

/**
 * Settings to use with the AzureOAIClient
 * These settings can be loaded from config
 */
export interface ModelSettings  {
    modelName: string;
    type?: ModelType;
    deployment?: string; // Optional
}

function validateOAIModel(model: ModelSettings): void {
    Validator.notEmpty(model.modelName, 'modelName');
    if (!model.deployment) {
        model.deployment = model.modelName;
    }
}

/**
 * Settings to use with the AzureOAIClient
 * These settings are typically loaded from config
 */
export interface OpenAISettings {
    apiKey: string;
    endpoint: string;
    organization?: string;
    models: ModelSettings[]; // Models available at this endpoint
    retrySettings?: retry.RetrySettings;
}

export function validateOAISettings(settings: OpenAISettings, isAzure = true): void {
    Validator.notEmpty(settings.apiKey, 'apiKey');
    if (isAzure) {
        Validator.notEmpty(settings.endpoint, 'endpoint');
    }
    Validator.notEmpty(settings.models, 'models');
    Validator.validate(settings.models, validateOAIModel);
}

export class OpenAIModels {
    private _models: ModelSettings[];

    constructor(models: ModelSettings[]) {
        this._models = models;
        this.updateModelInfo();
    }

    public getByName(name: string): ModelSettings | undefined {
        return this._models.find((m) => m.modelName === name);
    }
    public getByType(type: ModelType): ModelSettings | undefined {
        return this._models.find((m) => m.type === type);
    }
    public getCompletion() : ModelSettings | undefined {
        let model = this.getByType(ModelType.Chat); // Modern models are chat...
        if (model === undefined) {
            model = this.getByType(ModelType.Completion);
        }
        return model;
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

interface TextCompletion {
    text?: string;
}

export class OpenAIClient {
    private _apiSettings: OpenAISettings;
    private _models: OpenAIModels;
    private _client: OpenAIRestClient;

    constructor(apiSettings: OpenAISettings, isAzure: boolean) {
        validateOAISettings(apiSettings, isAzure);
        this._apiSettings = apiSettings;
        this._models = new OpenAIModels(apiSettings.models);
        if (isAzure) {
            this._client = new AzureOpenAIApiClient(this._apiSettings);
        } else {
            this._client = new OpenAIApiClient(this._apiSettings);
        }
    }

    public get models(): OpenAIModels {
        return this._models;
    }
    public get client(): OpenAIRestClient {
        return this._client;
    }
    public modelNameToUse(model: ModelSettings): string {
        return this._client.modelNameToUse(model);
    }
    public async getCompletion(
        prompt: string,
        model: string | ModelSettings,
        maxTokens?: number,
        temperature?: number,
        stop?: string[]
    ): Promise<string> {

        let modelSettings: ModelSettings;
        if (typeof model === 'string') {
            Validator.notEmpty(model, 'model');
            modelSettings = this.resolveModel(model as string);
        } else {
            modelSettings = model as ModelSettings;
        }

        const request: oai.CreateCompletionRequest = {
            model: '',
            prompt: prompt,
            max_tokens: maxTokens,
            temperature: temperature,
            stop: stop,
        };
        return this.getTextCompletion(modelSettings, request);
    }

    public async getTextCompletion(model: ModelSettings, request: oai.CreateCompletionRequest) : Promise<string> {
        Validator.defined(model, 'model');
        Validator.defined(request, 'request');

        request.model = this.modelNameToUse(model);
        // Completion and Chat models have different APIs! Older models have older APIs.
        let completions: TextCompletion[];
        if (model.type === ModelType.Completion) {
            completions = await this._client.getTextCompletion(request);
        } else if (model.type === ModelType.Chat) {
            completions = await this._client.getTextCompletionFromChat(request);
        } else {
            throw new TypechatException(
                TypechatErrorCode.ModelDoesNotSupportCompletion,
                model.modelName
            );
        }
        return this.firstCompletion(completions);
    }

    public createEmbedding(text: string, modelName: string): Promise<number[]> {
        Validator.notEmpty(text, 'text');

        const model = this.resolveModel(modelName);
        if (model.type !== ModelType.Embedding) {
            throw new TypechatException(
                TypechatErrorCode.ModelDoesNotSupportEmbeddings,
                modelName
            );
        }
        return this._client.createTextEmbedding(text, modelName);
    }

    public async createEmbeddings(texts: string[], modelName: string): Promise<number[][]> {
        // OAI is currently only allowing 1 embedding at a time for some models
        // Even though the API allows batching
        // So we have to do this in a loop for now.
        const embeddings: number[][] = new Array(texts.length);
        for (let i = 0; i < texts.length; ++i) {
            embeddings[i] = await this.createEmbedding(texts[i], modelName);
        }
        return embeddings;
    }

    private firstCompletion(completions: TextCompletion[]): string {
        let text = undefined;
        if (completions && completions.length > 0) {
            text = completions[0].text;
        }
        if (!text) {
            text = '';
        }
        return text;
    }

    private resolveModel(modelName: string): ModelSettings {
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

abstract class OpenAIRestClient {
    private _retrySettings: retry.RetrySettings;

    constructor(retrySettings?: retry.RetrySettings) {
        if (retrySettings) {
            this._retrySettings = retrySettings;
        } else {
            this._retrySettings = {
                maxAttempts: 5,
                retryPauseMS: 1000,
            };
        }
    }

    public abstract modelNameToUse(model: ModelSettings): string;

    public async getTextCompletion(request: oai.CreateCompletionRequest) : Promise<TextCompletion[]> {
        return await this.createCompletion(request);
    }

    public async getTextCompletionFromChat(request: oai.CreateCompletionRequest) : Promise<TextCompletion[]> {
        const completionRequest: oai.CreateChatCompletionRequest = {
            model: request.model,
            messages: [
                {
                    role: oai.ChatCompletionRequestMessageRoleEnum.User,
                    content: request.prompt as string,
                },
            ],
            max_tokens: request.max_tokens as number,
            temperature: request.temperature,
            presence_penalty: request.presence_penalty,
            frequency_penalty: request.frequency_penalty,
            stop: request.stop as string[]
        };
        const response = await this.createChatCompletion(completionRequest);
        return response.map((r) => {
            return {text : r.message?.content}
        });
    }

    public async createCompletion(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>> {
        return await this.executeWithRetry(() => this.createCompletionAttempt(request));
    }

    public async createChatCompletion(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>> {
        return await this.executeWithRetry(() => this.createChatCompletionAttempt(request));
    }

    public async createTextEmbedding(text: string, modelName: string): Promise<number[]> {
        const request: oai.CreateEmbeddingRequest = {
            model: modelName,
            input: [text],
        };
        const response = await this.createEmbedding(request);
        const data = response.data;
        return data[0].embedding;
    }

    public async createEmbedding(
        request: oai.CreateEmbeddingRequest
    ): Promise<oai.CreateEmbeddingResponse> {
        return await this.executeWithRetry(() => this.createEmbeddingAttempt(request));
    }

    protected executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        return  retry.executeWithRetry(
            this._retrySettings,
            fn,
            this.isTransientError
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected ensureSuccess(response: any) {
        if (response.status !== 200) {
            throw new OpenAIException(response.status, response.statusText);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected isTransientError(e: any): boolean {
        if (e.response) {
            return retry.isTransientHttpError(e.response.status);
        }
        if (e.status) {
            return retry.isTransientHttpError(e.status);
        }
        if (e instanceof OpenAIException) {
            return retry.isTransientHttpError(
                (e as OpenAIException).errorCode
            );
        }
        return false;
    }

    protected abstract createCompletionAttempt(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>>;

    protected abstract createChatCompletionAttempt(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>>;

    protected abstract createEmbeddingAttempt(
        request: oai.CreateEmbeddingRequest
    ): Promise<oai.CreateEmbeddingResponse>;
}

class AzureOpenAIApiClient extends OpenAIRestClient {
    _client: aoai.OpenAIApi;

    constructor(apiSettings: OpenAISettings) {
        Validator.defined(apiSettings, 'apiSettings');
        super(apiSettings.retrySettings);
        this._client = createAzureClient(apiSettings.apiKey, apiSettings.endpoint);
    }

    public modelNameToUse(model: ModelSettings): string {
        return model.deployment as string;
    }

    protected async createCompletionAttempt(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>> {
        const response = await this._client.createCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    protected async createChatCompletionAttempt(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>> {
        const response = await this._client.createChatCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    protected async createEmbeddingAttempt(
        request: oai.CreateEmbeddingRequest
    ): Promise<oai.CreateEmbeddingResponse> {
        const response = await this._client.createEmbedding(request);
        this.ensureSuccess(response);
        return response.data;
    }
}

class OpenAIApiClient extends OpenAIRestClient {
    _client: oai.OpenAIApi;

    constructor(apiSettings: OpenAISettings) {
        Validator.defined(apiSettings, 'apiSettings');
        super(apiSettings.retrySettings);
        this._client = createOAIClient(apiSettings.apiKey, apiSettings.organization);
    }

    public modelNameToUse(model: ModelSettings): string {
        return model.modelName;
    }

    protected async createCompletionAttempt(
        request: oai.CreateCompletionRequest
    ): Promise<Array<oai.CreateCompletionResponseChoicesInner>> {
        const response = await this._client.createCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    protected async createChatCompletionAttempt(
        request: oai.CreateChatCompletionRequest
    ): Promise<Array<oai.CreateChatCompletionResponseChoicesInner>> {
        const response = await this._client.createChatCompletion(request);
        this.ensureSuccess(response);
        return response.data.choices;
    }

    protected async createEmbeddingAttempt(
        request: oai.CreateEmbeddingRequest
    ): Promise<oai.CreateEmbeddingResponse> {
        const response = await this._client.createEmbedding(request);
        this.ensureSuccess(response);
        return response.data;
    }
}

function createAzureClient(apiKey: string, endpoint: string): aoai.OpenAIApi {
    const config: aoai.Configuration = new aoai.Configuration({
        apiKey: apiKey,
        azure: {
            apiKey: apiKey,
            endpoint: endpoint,
        },
    });
    const client: aoai.OpenAIApi = new aoai.OpenAIApi(config);
    return client;
}

function createOAIClient(apiKey: string, organization?: string) : oai.OpenAIApi {
    const config: oai.Configuration = new oai.Configuration({
        apiKey: apiKey,
        organization : organization
    });
    const client: oai.OpenAIApi = new oai.OpenAIApi(config);
    return client;
}
