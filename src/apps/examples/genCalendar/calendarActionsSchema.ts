export type CalendarActions = {
    actions: Action[];
};

export type Action =
    | AddEventAction
    | RemoveEventAction
    | ModifyEventAction
    | QueryEventAction
    | SetReminderAction;

export type AddEventAction = {
    type: 'addEvent';
    event: Event;
};

export type RemoveEventAction = {
    type: 'removeEvent';
    event: EventFilter;
};

export type ModifyEventAction = {
    type: 'modifyEvent';
    event: EventFilter;
    changes: EventChanges;
};

export type QueryEventAction = {
    type: 'queryEvent';
    event: EventFilter;
    query: Query;
};

export type SetReminderAction = {
    type: 'setReminder';
    event: EventFilter;
    reminder: Reminder;
};

export type Event = {
    day: string;
    timeRange: string;
    participants?: string[];
    location?: string;
    description?: string;
};

export type EventFilter = {
    day?: string;
    timeRange?: string;
    participants?: string[];
    location?: string;
    description?: string;
};

export type EventChanges = {
    day?: string;
    timeRange?: string;
    participants?: string[];
    location?: string;
    description?: string;
};

export type Query = {
    weather?: boolean;
    availability?: boolean;
    conflicts?: boolean;
};

export type Reminder = {
    time: string;
    message: string;
};
