// Copyright Microsoft Corp

import { StringBuilder, Validator } from '../core';
import {
    Message,
    Agent,
    MessageList,
    MessagePipeline,
    PromptBuffer,
} from './agent';
import { TextEmbeddingGenerator } from '../embeddings';
import * as oai from '../openai';

export interface ChatBotSettings {
    promptStartBlock?: string;
    promptEndBlock?: string;
    userName?: string;
    botName?: string;
    botPersonality?: string;
    chatModelName: string;
    // Inspect and modify message flow by attaching a custom message pipeline
    messagePipeline?: MessagePipeline;
    history?: MessageList;
    // Use this setting if you want context selection from history to find nearest/most similar 
    // messages instead of a simple sliding window
    relevancy?: {
        embeddingGenerator?: TextEmbeddingGenerator;
        topN: number;
        minScore: number;
    };
}

/**
 * A Simple Chatbot pipeline with included history and context instruction
 */
export class ChatBot extends Agent {
    private _settings: ChatBotSettings;
    private _history: MessageList;
    private _context: PromptBuffer;
    private _embeddings?: TextEmbeddingGenerator;

    constructor(client: oai.OpenAIClient, settings: ChatBotSettings) {
        const modelSettings = client.models.resolveModel(
            settings.chatModelName
        );
        super(client, modelSettings!, settings.messagePipeline);
        this._settings = settings;
        this._history = this.createHistory();
        this._context = new PromptBuffer(256);
    }
    public get settings(): ChatBotSettings {
        return this._settings;
    }
    public get history(): MessageList {
        return this._history;
    }
    public get maxContextLength(): number {
        return this._context.maxLength;
    }
    public set maxContextLength(value: number) {
        this._context.maxLength = value;
    }
    private botName(): string {
        return this._settings.botName || 'Bot';
    }
    private userName(): string {
        return this._settings.userName || 'User';
    }
    private contextBuilder() {
        return this._context;
    }

    protected startingRequest(message: Message): Message {
        message = super.startingRequest(message);
        if (!message.source.name) {
            message.source.name = this.userName();
        }
        return message;
    }
    protected async collectContext(
        message: Message
    ): Promise<string | undefined> {
        let context = await super.collectContext(message);
        if (context) {
            return context;
        }
        const builder = this.contextBuilder();
        builder.start();
        if (message) {
            builder.append(message.text);
            if (message.source.name) {
                builder.append(message.source.name);
            }
        }
        if (this._settings.relevancy !== undefined) {
            this.collectRelevantHistoryWindow(builder, message);
        } else {
            this.collectRecentHistoryWindow(builder, message);
        }
        context = builder.complete();

        return context;
    }
    protected buildPrompt(
        message: Message,
        context?: string
    ): string | undefined {
        let prompt = super.buildPrompt(message, context);
        if (!prompt) {
            prompt = StringBuilder.join(
                this.settings.promptStartBlock,
                context,
                this.settings.promptEndBlock
            );
        }
        return prompt;
    }
    protected onResponse(message: Message, response: Message): Message {
        super.onResponse(message, response);
        if (!response.source.name) {
            response.source.name = this.botName();
        }
        response.text = response.text.trim();
        return response;
    }
    protected async appendToHistory(message: Message): Promise<void> {
        if (this._embeddings && !message.embedding) {
            message.embedding = await this._embeddings?.createEmbedding(
                message.text
            );
        }
        this.history.append(message);
    }

    public collectRecentHistoryWindow(
        builder: PromptBuffer,
        message: Message
    ): void {
        builder.appendEvents(this._history.allEvents(true));
    }

    public async collectRelevantHistoryWindow(
        builder: PromptBuffer,
        message: Message
    ): Promise<void> {
        const relevancy = this._settings.relevancy;
        if (relevancy !== undefined) {
            const embedding = await this._embeddings?.createEmbedding(
                message.text
            );
            const matches = this._history.nearestEvents(
                embedding!,
                relevancy.topN,
                relevancy.minScore
            );
            builder.appendEvents(matches);
        }
    }

    private createHistory(): MessageList {
        if (this._settings.history !== undefined) {
            return this._settings.history!;
        }

        if (!this._settings.relevancy) {
            return new MessageList();
        }

        Validator.defined(
            this._settings.relevancy.embeddingGenerator,
            'embeddingGenerator'
        );
        this._embeddings = this._settings.relevancy.embeddingGenerator;
        return new MessageList();
    }
}
