// (c) Copyright Microsoft Corp

import { Configuration, CreateEmbeddingRequest, OpenAIApi } from "azure-openai";
import { assert } from "console";
import exp from "constants";

//type ModelSpecs = Readonly<typeof data>;
//export const Models : ModelSpecs = data;

export type ModelInfo = {
    name : string,
    type : string,
    maxTokenLength : number,
    embeddingSize? : number
}

export enum ModelType {
    Completion = "completion",
    Embedding = "embedding",
    Chat = "chat"
}

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

export function createClient(settings : ModelAPISettings) : any {
    let config : Configuration = new Configuration({
        apiKey : settings.apiKey,
        azure : {
            apiKey : settings.apiKey,
            endpoint : settings.endpoint,
            deploymentName : settings.deployment
        }});
    let client : OpenAIApi = new OpenAIApi(config);
    return client;
}
