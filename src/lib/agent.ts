import { StringBuilder } from "./core";
import * as oai from "./openai";
import { TypechatErrorCode, TypechatException } from "./typechatException";

export interface AgentEvent<T> {
    createDate: Date;
    lastUsed?: Date;
    data: T;
}

export interface AgentEventStream<T> {
    append(data: T): void;
    allEvents(orderByNewest: boolean): IterableIterator<AgentEvent<T>>;
}

class EventHistory<T> implements AgentEventStream<T> {
    private _history: AgentEvent<T>[]; // Always sorted by timestamp

    constructor() {
        this._history = [];
    }

    public append(data: T): void {
        this._history.push({
            createDate: new Date(),
            data: data,
        });
    }

    public *allEvents(orderByNewest: boolean): IterableIterator<AgentEvent<T>> {
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
}

export enum SourceType {
    AI,
    User,
}

export interface MessageSource {
    type: SourceType;
    name: string;
}

export interface ChatMessage {
    source: MessageSource;
    text: string;
}

class ChatContextBuilder {
    private _sb: StringBuilder;
    private _maxLength: number;

    constructor(maxLength: number) {
        this._maxLength = maxLength;
        this._sb = new StringBuilder();
    }

    public start(): void {
        this._sb.reset();
    }

    public append(value: string): boolean {
        if (this._sb.length + value.length <= this._maxLength) {
            this._sb.append(value);
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
        for (const evt of events) {
            if (!this.appendMessage(evt.data)) {
                return false;
            };
        }
        return true;
    }

    public complete(): string {
        this._sb.reverse();
        return this._sb.toString();
    }
}

export interface IChatSettings {
    userName?: string;
    aiName?: string;
    modelName: string;
    maxTokens?: number;
    temperature?: number;
}
// Basic Chat Bot
class Chat {
    private _settings: IChatSettings;
    private _client: oai.OpenAIClient;
    private _model: oai.ModelSettings; // Model we are speaking with
    private _history: AgentEventStream<ChatMessage>;
    private _contextBuilder: ChatContextBuilder;

    constructor(
        settings: IChatSettings,
        client: oai.OpenAIClient,
        history: AgentEventStream<ChatMessage>,
        contextBuilder: ChatContextBuilder
    ) {
        this._settings = settings;
        this._client = client;
        const modelSettings = client.models.getByName(settings.modelName);
        if (modelSettings === undefined) {
            throw new TypechatException(TypechatErrorCode.ModelNotFound);
        }
        this._model = modelSettings;
        this._history = history;
        this._contextBuilder = contextBuilder;
    }

    public async getResponse(userMessage: string): Promise<string> {
        const context = this.collectHistory(userMessage);
        const response = await this._client.getCompletion(
            context,
            this._model,
            this._settings.maxTokens,
            this._settings.temperature
        );
        this.appendHistory(userMessage, response);
        return response;
    }

    public collectHistory(input: string): string {
        this._contextBuilder.start();
        this._contextBuilder.append(input);
        this._contextBuilder.appendEvents(this._history.allEvents(true));
        return this._contextBuilder.complete();
    }

    public appendHistory(userMessage: string, response?: string): void {
        this._history.append({
            text: userMessage,
            source: {
                type: SourceType.User,
                name: this._settings.userName || 'User',
            }
        });

        if (response !== undefined) {
            this._history.append({
                text: userMessage,
                source: {
                    type: SourceType.AI,
                    name: this._settings.aiName || 'AI',
                },
            });
        }
    }
}
