export type EventTimeRange = {
    startTime?: string;
    endTime?: string;
    duration?: string;
};

export type Event = {
    // date (example: March 22, 2024) or relative date (example: after EventReference)
    day: string;
    timeRange: EventTimeRange;
    description: string;
    location?: string;
    // a list of people or named groups like 'team'
    participants?: string[];
};

// properties used by the requester in referring to an event
// these properties are only specified if given directly by the requester
export type EventReference = {
    // date (example: March 22, 2024) or relative date (example: after EventReference)
    day?: string;
    // (examples: this month, this week, in the next two days)
    dayRange?: string;
    timeRange?: EventTimeRange;
    description?: string;
    location?: string;
    participants?: string[];
};

export type AddEventAction = {
    actionType: 'add event';
    event: Event;
};

export type RemoveEventAction = {
    actionType: 'removeEvent';
    eventReference: EventReference;
};

export type AddParticipantsAction = {
    actionType: 'add participants';
    // event to be augmented; if not specified assume last event discussed
    eventReference?: EventReference;
    // new participants (one or more)
    participants: string[];
};

export type ChangeTimeRangeAction = {
    actionType: 'change time range';
    // event to be changed
    eventReference?: EventReference;
    // new time range for the event
    timeRange: EventTimeRange;
};

export type ChangeDescriptionAction = {
    actionType: 'change description';
    // event to be changed
    eventReference?: EventReference;
    // new description for the event
    description: string;
};

export type FindEventsAction = {
    actionType: 'find events';
    // one or more event properties to use to search for matching events
    eventReference: EventReference;
};

// if the user types text that can not easily be understood as a calendar action, this action is used
export interface UnknownAction {
    actionType: 'unknown';
    // text typed by the user that the system did not understand
    text: string;
}

export type Action =
    | AddEventAction
    | RemoveEventAction
    | AddParticipantsAction
    | ChangeTimeRangeAction
    | ChangeDescriptionAction
    | FindEventsAction
    | UnknownAction;

export type CalendarActions = {
    actions: Action[];
};
