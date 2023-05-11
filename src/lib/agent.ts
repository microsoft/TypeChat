export interface IAgentEvent<T, S> {
    timestamp: Date;
    data: T;
    eventSource: S;
}

export interface IAgentEventFilter<S> {
    minDate?: Date;
    maxDate?: Date;
    eventSource?: S;
}

export interface IAgentEventLog<T, S> {
    append(event: IAgentEvent<T, S>): void;
    filter(filter: IAgentEventFilter<S>): IterableIterator<IAgentEvent<T, S>>;
}

class EventHistory<T, S> implements IAgentEventLog<T, S> {
    private _maxSize: number;

    constructor(maxHistorySize: number) {
        this._maxSize = maxHistorySize;
    }

    public append(event: IAgentEvent<T, S>): void {
        throw new Error('Method not implemented.');
    }

    public filter(filter: IAgentEventFilter<S>): IterableIterator<IAgentEvent<T, S>> {
        throw new Error('Method not implemented.');
    }
}
