// (c) Copyright Microsoft Corp

import * as oai from "azure-openai";
import { Embedding, ITextEmbeddingGenerator } from "./embeddings";
import * as retry from "./retry";
import { TypechatException } from "./exception";

/**
 * Types of models we work with
 */
export enum ModelType {
    Completion = "completion",
    Embedding = "embedding",
    Chat = "chat",
    Image = "image"
}

/**
 * Model information, like token budgets and
 */
export type ModelInfo = {
    name : string,
    type : string,
    maxTokenLength : number,
    embeddingSize? : number
    // Add Tokenizer Here
}

/**
 * A registry of model information
 */
export const Models : ModelInfo[] = [
    {
        "name" : "text-davinci-002",
        "maxTokenLength" : 4096,
        "type" : ModelType.Completion 
    },
    {
        "name" : "text-embedding-ada-002",
        "maxTokenLength" : 8191,
        "type": ModelType.Embedding,
        "embeddingSize" : 1536
    },
    {
        "name" : "gpt-4",
        "maxTokenLength":8192,
        "type" : ModelType.Completion
    },
    {
        "name": "gpt-3.5-turbo",
        "maxTokenLength" : 4096,
        "type" : ModelType.Chat
    }
];

export type ModelAPISettings = {
    modelName : string,
    deployment : string,
    apiKey : string,
    endpoint : string
}

export class OpenAIException extends TypechatException<number> {
    constructor(statusCode : number, message? : string) {
        super(statusCode, message);
    }
}

export class OpenAIClient implements ITextEmbeddingGenerator {
 
    private _retrySettings : retry.RetrySettings;
    private _modelSettings : ModelAPISettings;
    private _client : oai.OpenAIApi;
    
    constructor(modelSettings : ModelAPISettings, retrySettings? : retry.RetrySettings) {
        this._modelSettings = modelSettings;
        this._client = createClient(modelSettings);
        if (retrySettings) {
            this._retrySettings = retrySettings;
        }
        else {
            this._retrySettings = {
                maxAttempts : 5,
                retryPauseMS : 1000
            }
        }
    }

    public async createEmbeddings(texts: string[]): Promise<Embedding[]> {
        let embeddings : Embedding[]= await retry.executeWithRetry(
            this._retrySettings.maxAttempts,
            this._retrySettings.retryPauseMS,
            () => this.createEmbeddingsAttempt(texts),
            this.isTransientError
        );
        return embeddings;
    }

    private async createEmbeddingsAttempt(texts: string[]): Promise<Embedding[]> {
        let response = await this._client.createEmbedding({
            model : this._modelSettings.deployment,
            input : texts
        });
        if (response.status == 200) {
            return this.toEmbeddings(response.data);
        }
        throw new OpenAIException(response.status, response.statusText);
    }

    private toEmbeddings(response: oai.CreateEmbeddingResponse) : Embedding[] {
        let data = response.data;
        let embeddings : Embedding[] = new Array(data.length);
        for (let i = 0; i < data.length; ++i)
        {
            embeddings[i] = new Embedding(data[i].embedding);
        }
        return embeddings;
    }   

    private isTransientError(e : Error) : boolean {
        if (e instanceof OpenAIException) {
            return retry.isTransientHttpError((e as OpenAIException).errorCode);
        } 
        return false;
    }
}

function createClient(settings : ModelAPISettings) : any {
    let config : oai.Configuration = new oai.Configuration({
        apiKey : settings.apiKey,
        azure : {
            apiKey : settings.apiKey,
            endpoint : settings.endpoint,
            deploymentName : settings.deployment
        }});
    let client : oai.OpenAIApi = new oai.OpenAIApi(config);
    return client;
}

