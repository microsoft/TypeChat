// Copyright Microsoft Corp

import { PropertyBag, StringBuilder, Validator } from '../core';
import * as vector from '../embeddings';
import * as oai from '../openai';
import * as oaiapi from 'openai';
import { AgentEvent, AgentEventList } from './agentHistory';
import { Embedding, EmbeddingList } from '../embeddings';

export enum MessageSourceType {
    AI,
    User,
}

export interface MessageSource {
    type: MessageSourceType;
    name?: string;
}

export interface Message {
    source: MessageSource;
    text: string;
    embedding?: vector.Embedding;
    properties?: PropertyBag;
}

export class MessageList extends AgentEventList<Message> {
    _embeddings?: EmbeddingList;

    constructor() {
        super();
    }

    public append(data: Message): void {
        super.append(data);
        if (data.embedding) {
            this.ensureEmbeddings().add(data.embedding);
        }
    }

    public *nearestEvents(
        embedding: Embedding,
        topNCount: number,
        minScore: number
    ): IterableIterator<AgentEvent<Message>> {
        if (this._embeddings) {
            const matches = this._embeddings.indexOfNearestNeighbors(
                embedding,
                topNCount,
                minScore
            );
            for (let i = 0; i < matches?.length; ++i) {
                yield this.get(i);
            }
        }
    }

    public trim(trimBy: number): void {
        super.trim(trimBy);
        this._embeddings?.trim(trimBy);
    }

    private ensureEmbeddings(): EmbeddingList {
        if (!this._embeddings) {
            this._embeddings = new EmbeddingList();
        }
        return this._embeddings;
    }
}

export interface MessagePipeline {
    startingRequest?: (agent: Agent, message: Message) => Message;
    collectContext?: (
        agent: Agent,
        message: Message
    ) => Promise<string | undefined>;
    buildPrompt?: (
        agent: Agent,
        message: Message,
        context?: string
    ) => string | undefined;
    getResponse?: (
        agent: Agent,
        request: Message
    ) => Promise<Message | undefined>;
    validateResponse?: (
        agent: Agent,
        request: Message,
        response: Message
    ) => Promise<ResponseValidationResult>;
    // Handle a valid received response
    responseReceived?: (
        agent: Agent,
        request: Message,
        response: Message
    ) => Message;
    appendToHistory?: (agent: Agent, message: Message) => Promise<void>;
}

export interface ResponseValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

/**
 * Implements a customizable and hookable chat message pipeline
 */
export class Agent {
    private _client: oai.OpenAIClient;
    private _model: oai.ModelSettings; // Model we are speaking with
    private _modelInfo?: oai.ModelInfo;
    private _pipeline?: MessagePipeline;
    private _properties: PropertyBag;
    private _maxValidationAttempts: number;

    constructor(
        client: oai.OpenAIClient,
        model: oai.ModelSettings,
        pipeline?: MessagePipeline
    ) {
        this._client = client;
        this._model = model;
        this._modelInfo = oai.getKnownModel(model.modelName);
        this._pipeline = pipeline;
        this._properties = {};
        this._maxValidationAttempts = 1;
    }

    public get modelInfo(): oai.ModelInfo | undefined {
        return this._modelInfo;
    }
    public get client(): oai.OpenAIClient {
        return this._client;
    }
    public get pipeline(): MessagePipeline | undefined {
        return this._pipeline;
    }
    public set pipeline(pipeline: MessagePipeline | undefined) {
        this._pipeline = pipeline;
    }
    public get properties(): PropertyBag {
        return this._properties;
    }
    public get maxValidationAttempts(): number {
        return this._maxValidationAttempts;
    }
    public set maxValidationATtempts(value: number) {
        Validator.greaterThan(value, 0, 'maxValidationAttempts');
        this._maxValidationAttempts = value;
    }
    public async getCompletion(
        message: string,
        maxTokens?: number,
        temperature?: number
    ): Promise<string> {
        Validator.defined(message, 'message');
        const requestMessage: Message = {
            text: message,
            source: {
                type: MessageSourceType.User,
            },
        };
        const requestParams: oaiapi.CreateCompletionRequest = {
            model: '',
            prompt: '',
            max_tokens: maxTokens,
            temperature: temperature,
        };
        const responseMessage = await this.runCompletion(
            requestMessage,
            requestParams
        );
        return responseMessage.text;
    }

    public async runCompletion(
        request: Message,
        requestParams: oaiapi.CreateCompletionRequest
    ): Promise<Message> {
        // Pre-process message before sending
        request = await this.startingRequest(request);

        // Collect historical context to send to the AI
        const context = await this.collectContext(request);

        // Use message and context to build a prompt
        let prompt = this.buildPrompt(request, context);
        if (!prompt) {
            prompt = request.text;
        }
        requestParams.prompt = prompt;

        let response: Message = await this.getValidResponse(
            request,
            requestParams
        );

        // Post-process the response
        response = await this.onResponse(request, response);

        // Save to history
        await this.appendToHistory(request);
        await this.appendToHistory(response);
        return response;
    }

    protected startingRequest(message: Message): Message {
        if (this._pipeline?.startingRequest) {
            return this._pipeline.startingRequest(this, message);
        }
        return message;
    }
    protected async collectContext(
        message: Message
    ): Promise<string | undefined> {
        if (this._pipeline?.collectContext) {
            return await this._pipeline.collectContext(this, message);
        }
        return undefined;
    }
    protected buildPrompt(
        message: Message,
        context?: string
    ): string | undefined {
        if (this._pipeline?.buildPrompt) {
            return this._pipeline.buildPrompt(this, message, context);
        }
        return undefined;
    }
    protected async getResponse(
        request: Message
    ): Promise<Message | undefined> {
        if (this._pipeline?.getResponse) {
            return await this._pipeline.getResponse(this, request);
        }
        return undefined;
    }
    protected async getValidResponse(
        request: Message,
        requestParams: oaiapi.CreateCompletionRequest
    ): Promise<Message> {
        const cachedResponse = await this.getResponse(request);
        if (cachedResponse) {
            return cachedResponse!;
        }
        const originalPrompt = requestParams.prompt;
        const response: Message = {
            source: {
                type: MessageSourceType.AI,
            },
            text: '',
        };
        for (let i = 0; i < this._maxValidationAttempts; ++i) {
            response.text = await this._client.getTextCompletion(
                this._model,
                requestParams
            );
            // Verify the response
            const validation = await this.validateResponse(request, response);
            if (validation.isValid) {
                return response;
            }
            if (validation.errorMessage) {
                requestParams.prompt = originalPrompt + validation.errorMessage;
            }
        }
        response.text = ''; // Eat the bad message
        return response;
    }
    protected async validateResponse(
        request: Message,
        response: Message
    ): Promise<ResponseValidationResult> {
        if (this._pipeline?.validateResponse) {
            return await this._pipeline.validateResponse(
                this,
                request,
                response
            );
        }
        return { isValid: true };
    }
    protected onResponse(message: Message, response: Message): Message {
        if (this._pipeline?.responseReceived) {
            return this._pipeline.responseReceived(this, message, response);
        }
        return response;
    }
    protected async appendToHistory(message: Message): Promise<void> {
        if (this._pipeline?.appendToHistory) {
            await this._pipeline.appendToHistory(this, message);
        }
    }
}
