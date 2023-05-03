// (c) Copyright Microsoft Corp

import * as oai from 'azure-openai';
import {Embedding, ITextEmbeddingGenerator} from './embeddings';
import * as retry from './retry';
import {TypechatException} from './exception';

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
 * Model information, like token budgets and
 */
export type ModelInfo = {
    name: string;
    type: string;
    maxTokenLength: number;
    embeddingSize?: number;
    // Add Tokenizer Here
};

/**
 * A registry of model information
 */
export const Models: ModelInfo[] = [
    {
        name: 'text-davinci-002',
        maxTokenLength: 4096,
        type: ModelType.Completion,
    },
    {
        name: 'text-embedding-ada-002',
        maxTokenLength: 8191,
        type: ModelType.Embedding,
        embeddingSize: 1536,
    },
    {
        name: 'gpt-4',
        maxTokenLength: 8192,
        type: ModelType.Completion,
    },
    {
        name: 'gpt-3.5-turbo',
        maxTokenLength: 4096,
        type: ModelType.Chat,
    },
];

export type ModelAPISettings = {
    modelName: string;
    deployment: string;
    apiKey: string;
    endpoint: string;
};

export class OpenAIException extends TypechatException<number> {
    constructor(statusCode: number, message?: string) {
        super(statusCode, message);
    }
}

/**
 * OpenAIClient with:
 *   Built in retry around transient errors
 *   Wrapper APIs for common scenarios
 */
export class OpenAIClient implements ITextEmbeddingGenerator {
    private _retrySettings: retry.RetrySettings;
    private _modelSettings: ModelAPISettings;
    private _client: oai.OpenAIApi;

    constructor(
        modelSettings: ModelAPISettings,
        retrySettings?: retry.RetrySettings
    ) {
        this._modelSettings = modelSettings;
        this._client = createClient(modelSettings);
        if (retrySettings) {
            this._retrySettings = retrySettings;
        } else {
            this._retrySettings = {
                maxAttempts: 5,
                retryPauseMS: 1000,
            };
        }
    }

    public async getCompletion(
        prompt: string,
        maxTokens?: number,
        temperature?: number
    ): Promise<string> {
        const request: oai.CreateCompletionRequest = {
            model: this._modelSettings.deployment,
            prompt: prompt,
            max_tokens: maxTokens,
            temperature: temperature,
        };
        return retry.executeWithRetry(
            this._retrySettings.maxAttempts,
            this._retrySettings.retryPauseMS,
            () => this.getCompletionAttempt(request),
            this.isTransientError
        );
    }

    public async createEmbedding(text: string): Promise<Embedding> {
        const request: oai.CreateEmbeddingRequest = {
            model: this._modelSettings.deployment,
            input: [text],
        };
        const embeddings: Embedding[] = await retry.executeWithRetry(
            this._retrySettings.maxAttempts,
            this._retrySettings.retryPauseMS,
            () => this.createEmbeddingsAttempt(request),
            this.isTransientError
        );
        return embeddings[0];
    }

    public async createEmbeddings(texts: string[]): Promise<Embedding[]> {
        // Azure OAI is currently only allowing 1 embedding at a time, even though the API allows batching
        // So we have to do this in a loop.
        const embeddings: Embedding[] = new Array(texts.length);
        for (let i = 0; i < texts.length; ++i) {
            embeddings[i] = await this.createEmbedding(texts[i]);
        }
        return embeddings;
    }

    private async getCompletionAttempt(
        request: oai.CreateCompletionRequest
    ): Promise<string> {
        const response = await this._client.createCompletion(request);
        if (response.status == 200) {
            let text = response.data.choices[0].text;
            if (!text) {
                text = '';
            }
            return text;
        }
        throw new OpenAIException(response.status, response.statusText);
    }

    private async createEmbeddingsAttempt(
        request: oai.CreateEmbeddingRequest
    ): Promise<Embedding[]> {
        const response = await this._client.createEmbedding(request);
        if (response.status == 200) {
            return this.toEmbeddings(response.data);
        }
        throw new OpenAIException(response.status, response.statusText);
    }

    private toEmbeddings(response: oai.CreateEmbeddingResponse): Embedding[] {
        const data = response.data;
        const embeddings: Embedding[] = new Array(data.length);
        for (let i = 0; i < data.length; ++i) {
            embeddings[i] = new Embedding(data[i].embedding);
        }
        return embeddings;
    }

    private isTransientError(e: any): boolean {
        if (e.response) {
            return retry.isTransientHttpError(e.response.status);
        }
        if (e.status) {
            return retry.isTransientHttpError(e.status);
        }
        if (e instanceof OpenAIException) {
            return retry.isTransientHttpError((e as OpenAIException).errorCode);
        }
        return false;
    }
}

function createClient(settings: ModelAPISettings): any {
    const config: oai.Configuration = new oai.Configuration({
        apiKey: settings.apiKey,
        azure: {
            apiKey: settings.apiKey,
            endpoint: settings.endpoint,
            deploymentName: settings.deployment,
        },
    });
    const client: oai.OpenAIApi = new oai.OpenAIApi(config);
    return client;
}
