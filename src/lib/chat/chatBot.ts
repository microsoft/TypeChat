// Copyright Microsoft Corp

import { StringBuilder, Validator } from '../core';
import { AgentEvent } from './agentHistory';
import { Message, Agent, MessageList } from './agent';
import { TextEmbeddingGenerator } from '../embeddings';
import * as oai from '../openai';

export class ContextBuilder {
    private _sb: StringBuilder;
    private _maxLength: number;

    constructor(maxLength: number) {
        this._maxLength = maxLength;
        this._sb = new StringBuilder();
    }

    public get length() {
        return this._sb.length;
    }

    public get maxLength(): number {
        return this._maxLength;
    }
    public set maxLength(value: number) {
        Validator.greaterThan(value, 0, 'maxLength');
        this._maxLength = value;
    }

    public start(): void {
        this._sb.reset();
    }

    public append(value: string): boolean {
        if (!value) {
            return true;
        }
        if (this._sb.length + (value.length + 1) <= this._maxLength) {
            this._sb.appendLine(value);
            return true;
        }
        return false;
    }

    public appendMessage(chatMessage: Message): boolean {
        if (this.append(chatMessage.text)) {
            if (chatMessage.source.name) {
                return this.append(chatMessage.source.name);
            }
            return true;
        }
        return false;
    }

    public appendEvents(
        events: IterableIterator<AgentEvent<Message>>
    ): boolean {
        let result = true;
        for (const evt of events) {
            if (!this.appendMessage(evt.data)) {
                result = false;
                break;
            }
        }
        return result;
    }

    public complete(): string {
        this._sb.reverse();
        return this._sb.toString();
    }
}

export interface ChatBotSettings {
    promptStartBlock?: string;
    promptEndBlock?: string;
    userName?: string;
    botName?: string;
    chatModelName: string;
    history?: MessageList;
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
    private _contextBuilder: ContextBuilder;
    private _embeddings?: TextEmbeddingGenerator;

    constructor(client: oai.OpenAIClient, settings: ChatBotSettings) {
        const modelSettings = client.models.resolveModel(
            settings.chatModelName
        );
        super(client, modelSettings!);
        this._settings = settings;
        this._history = this.createHistory();
        this._contextBuilder = new ContextBuilder(256);
    }
    public get settings(): ChatBotSettings {
        return this._settings;
    }
    public get history(): MessageList {
        return this._history;
    }
    public get maxContextLength(): number {
        return this._contextBuilder.maxLength;
    }
    public set maxContextLength(value: number) {
        this._contextBuilder.maxLength = value;
    }
    private botName(): string {
        return this._settings.botName || 'Bot';
    }
    private userName(): string {
        return this._settings.userName || 'User';
    }
    private contextBuilder() {
        return this._contextBuilder;
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
            if (message.source.name) {
                builder.append(message.source.name);
            }
            builder.append(message.text);
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
        builder: ContextBuilder,
        message: Message
    ): void {
        builder.appendEvents(this._history.allEvents(true));
    }

    public async collectRelevantHistoryWindow(
        builder: ContextBuilder,
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
