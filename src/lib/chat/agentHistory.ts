// Copyright Microsoft Corp

import { Validator } from "../core";

export interface AgentEvent<T> {
    readonly seqNumber: number;
    readonly createDate: Date;
    data: T; // This can also be rewritten by the AI
}

export interface AgentEventStream<T> {
    count: number;
    append(data: T): void;
    allEvents(orderByNewest: boolean): IterableIterator<AgentEvent<T>>;
    eventsInTimeRange(
        minDate: Date,
        maxDate: Date
    ): IterableIterator<AgentEvent<T>>;
    // More methods for last N, filtering by dates etc.
}

//
// Very simple in-memory.. memory
// The events in this class are deliberately mutable
// This allows for easy experimentation with rewriting events, or compressing/merging
// past events, or creating synthetic events from existing ones
//
export class AgentEventList<T> implements AgentEventStream<T> {
    private _history: AgentEvent<T>[]; // Always sorted by timestamp
    private _seqNumber: number;
    constructor() {
        this._history = [];
        this._seqNumber = 0;
    }

    public get count() {
        return this._history.length;
    }

    public get(index: number): AgentEvent<T> {
        return this._history[index];
    }

    public append(data: T): void {
        this._seqNumber++;
        this._history.push({
            seqNumber: this._seqNumber,
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

    public *eventsInTimeRange(
        minDate: Date,
        maxDate: Date
    ): IterableIterator<AgentEvent<T>> {
        // First quick cut. We can easily optimize this by binary searching or using a better store
        Validator.true(minDate <= maxDate);
        for (let i = this._history.length - 1; i >= 0; --i) {
            const evt = this._history[i];
            if (evt.createDate < minDate) {
                break;
            } else if (evt.createDate <= maxDate) {
                yield evt;
            }
        }
    }

    // Trim history by this much
    public trim(trimBy: number): void {
        if (trimBy >= this._history.length) {
            this._history.length = 0;
        } else {
            this._history.splice(0, trimBy);
        }
    }
}
