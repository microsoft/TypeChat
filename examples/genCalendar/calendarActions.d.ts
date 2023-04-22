
type CalendarActions = {
    actions: Action[];
  }
  
  type Action = AddEventAction | RemoveEventAction | ModifyEventAction | QueryEventAction | SetReminderAction;
  
  type AddEventAction = {
    type: "addEvent";
    event: Event;
  }
  
  type RemoveEventAction = {
    type: "removeEvent";
    event: EventFilter;
  }
  
  type ModifyEventAction = {
    type: "modifyEvent";
    event: EventFilter;
    changes: EventChanges;
  }
  
  type QueryEventAction = {
    type: "queryEvent";
    event: EventFilter;
    query: Query;
  }
  
  type SetReminderAction = {
    type: "setReminder";
    event: EventFilter;
    reminder: Reminder;
  }
  
  type Event = {
    day: string;
    timeRange: string;
    participants: string[];
    location?: string;
    description?: string;
  }
  
  type EventFilter = {
    day?: string;
    timeRange?: string;
    participants?: string[];
    location?: string;
    description?: string;
  }
  
  type EventChanges = {
    day?: string;
    timeRange?: string;
    participants?: string[];
    location?: string;
    description?: string;
  }
  
  type Query = {
    weather?: boolean;
    availability?: boolean;
    conflicts?: boolean;
  }
  
  type Reminder = {
    time: string;
    message: string;
  }