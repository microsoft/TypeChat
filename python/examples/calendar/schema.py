from typing import Literal, NotRequired, TypedDict, Annotated


def Doc(s: str) -> str:
    return s


class UnknownAction(TypedDict):
    """
    if the user types text that can not easily be understood as a calendar action, this action is used
    """

    actionType: Literal["Unknown"]
    text: Annotated[str, Doc("text typed by the user that the system did not understand")]


class EventTimeRange(TypedDict, total=False):
    startTime: str
    endTime: str
    duration: str


class Event(TypedDict):
    day: Annotated[str, Doc("date (example: March 22, 2024) or relative date (example: after EventReference)")]
    timeRange: EventTimeRange
    description: str
    location: NotRequired[str]
    participants: NotRequired[Annotated[list[str], Doc("a list of people or named groups like 'team'")]]


class EventReference(TypedDict, total=False):
    """
    properties used by the requester in referring to an event
    these properties are only specified if given directly by the requester
    """

    day: Annotated[str, Doc("date (example: March 22, 2024) or relative date (example: after EventReference)")]
    dayRange: Annotated[str, Doc("(examples: this month, this week, in the next two days)")]
    timeRange: EventTimeRange
    description: str
    location: str
    participants: list[str]


class FindEventsAction(TypedDict):
    actionType: Literal["find events"]
    eventReference: Annotated[EventReference, Doc("one or more event properties to use to search for matching events")]


class ChangeDescriptionAction(TypedDict):
    actionType: Literal["change description"]
    eventReference: NotRequired[Annotated[EventReference, Doc("event to be changed")]]
    description: Annotated[str, Doc("new description for the event")]


class ChangeTimeRangeAction(TypedDict):
    actionType: Literal["change time range"]
    eventReference: NotRequired[Annotated[EventReference, Doc("event to be changed")]]
    timeRange: Annotated[EventTimeRange, Doc("new time range for the event")]


class AddParticipantsAction(TypedDict):
    actionType: Literal["add participants"]
    eventReference: NotRequired[
        Annotated[EventReference, Doc("event to be augmented; if not specified assume last event discussed")]
    ]
    participants: NotRequired[Annotated[list[str], "new participants (one or more)"]]


class RemoveEventAction(TypedDict):
    actionType: Literal["remove event"]
    eventReference: EventReference


class AddEventAction(TypedDict):
    actionType: Literal["add event"]
    event: Event


Actions = (
    AddEventAction
    | RemoveEventAction
    | AddParticipantsAction
    | ChangeTimeRangeAction
    | ChangeDescriptionAction
    | FindEventsAction
    | UnknownAction
)


class CalendarActions(TypedDict):
    actions: list[Actions]
