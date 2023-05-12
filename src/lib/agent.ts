import { StringBuilder } from './core';
import * as oai from './openai';
import { TypechatErrorCode, TypechatException } from './typechatException';

export interface AgentEvent<T> {
    readonly createDate: Date;
    lastUsed?: Date; // Last used is handy for relevancy
    data: T; // This can also be rewritten by the AI
}

export interface AgentEventStream<T> {
    length: number;
    append(data: T): void;
    allEvents(orderByNewest: boolean): IterableIterator<AgentEvent<T>>;
    // More methods for last N, filtering by dates etc. 
}

//
// The events in this class are deliberately mutable
// This allows for easy experimentation with rewriting events, or compressing/merging
// past events, or creating synthetic events from existing ones
//
export class EventHistory<T> implements AgentEventStream<T> {
    private _history: AgentEvent<T>[]; // Always sorted by timestamp

    constructor() {
        this._history = [];
    }

    public get length() {
        return this._history.length;
    }

    public get(index: number): AgentEvent<T> {
        return this._history[index];
    }

    public append(data: T): void {
        this._history.push({
            createDate: new Date(),
            data: data,
        });
    }

    public *allEvents(orderByNewest = true): IterableIterator<AgentEvent<T>> {
        if (orderByNewest) {
            for (let i = this._history.length - 1; i >= 0; --i) {
                yield this._history[i];
            }
        } else {
            for (let i = 0; i < this._history.length; ++i) {
                yield this._history[i];
            }
        }
    }

    // Trim history by this much
    public trim(count: number): void {
        if (count >= this._history.length) {
            this._history.length = 0;
        } else {
            this._history.splice(0, count);
        }
    }
}

export enum SourceType {
    AI,
    User,
}

export interface MessageSource {
    readonly type: SourceType;
    readonly name: string;
}

export interface ChatMessage {
    readonly source: MessageSource;
    readonly text: string;
}

export class ChatContextBuilder {
    private _sb: StringBuilder;
    private _maxLength: number;

    constructor(maxLength: number) {
        this._maxLength = maxLength;
        this._sb = new StringBuilder();
    }

    public length() {
        return this._sb.length;
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

    public appendMessage(chatMessage: ChatMessage): boolean {
        return (
            this.append(chatMessage.text) &&
            this.append(chatMessage.source.name)
        );
    }

    public appendEvents(
        events: IterableIterator<AgentEvent<ChatMessage>>
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

    public buildContext(
        userInput: string,
        events: IterableIterator<AgentEvent<ChatMessage>>
    ): string {
        this.start();
        if (this.append(userInput)) {
            this.appendEvents(events);
        }
        return this.complete();
    }
}

export interface IChatSettings {
    userName?: string;
    aiName?: string;
    history?: AgentEventStream<ChatMessage>;
    modelName: string;
    maxTokensIn: number;
    maxTokensOut?: number;
    temperature?: number;
}

// Basic Chat Bot
export class Chat {
    private _settings: IChatSettings;
    private _client: oai.OpenAIClient;
    private _model: oai.ModelSettings; // Model we are speaking with
    private _history: AgentEventStream<ChatMessage>;
    private _contextBuilder: ChatContextBuilder;

    constructor(settings: IChatSettings, client: oai.OpenAIClient) {
        this._settings = settings;
        this._client = client;
        const modelSettings = client.models.getByName(settings.modelName);
        if (modelSettings === undefined) {
            throw new TypechatException(TypechatErrorCode.ModelNotFound);
        }
        this._model = modelSettings;
        if (settings.history !== undefined) {
            this._history = settings.history;
        } else {
            this._history = new EventHistory();
        }
        this._contextBuilder = new ChatContextBuilder(
            this._settings.maxTokensIn
        );
    }

    public get history() {
        return this._history;
    }

    public async getResponse(userMessage: string): Promise<string> {
        const context = this.buildContext(userMessage);
        const response = await this._client.getCompletion(
            context,
            this._model,
            this._settings.maxTokensOut,
            this._settings.temperature
        );
        this.appendHistory(userMessage, response);
        return response;
    }

    private buildContext(userMessage: string): string {
        userMessage = this.userName() + '\n' + userMessage;
        return this._contextBuilder.buildContext(
            userMessage,
            this._history.allEvents(true)
        );
    }

    public appendHistory(userMessage: string, response?: string): void {
        this._history.append({
            text: userMessage,
            source: {
                type: SourceType.User,
                name: this.userName(),
            },
        });

        if (response !== undefined) {
            this._history.append({
                text: response,
                source: {
                    type: SourceType.AI,
                    name: this.aiName(),
                },
            });
        }
    }

    private aiName(): string {
        return (this._settings.aiName || 'Bot');
    }

    private userName(): string {
        return (this._settings.userName || 'User');
    }
}
