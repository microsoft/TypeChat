from typing_extensions import TypedDict, Annotated, NotRequired, Literal, Doc


class Quantity(TypedDict):
    value: Annotated[float, Doc("Exact number")]
    units: Annotated[str, Doc("UNITS include mg, kg, cm, pounds, liter, ml, tablet, pill, cup, per-day, per-week..ETC")]


class ApproxDatetime(TypedDict):
    displayText: Annotated[str, Doc("Default: Unknown. Required")]
    timestamp: NotRequired[Annotated[str, Doc("If precise timestamp can be set")]]


class ApproxQuantity(TypedDict):
    displayText: Annotated[str, Doc("Default: Unknown. Required")]
    quantity: NotRequired[Annotated[Quantity, Doc("Optional: only if precise quantities are available")]]


class OtherHealthData(TypedDict):
    """
    Use for health data that match nothing else. E.g. immunization, blood prssure etc
    """

    text: str
    when: NotRequired[ApproxDatetime]


class Condition(TypedDict):
    """
    Disease, Ailment, Injury, Sickness
    """

    name: Annotated[str, Doc("Fix any spelling mistakes, especially phonetic spelling")]
    startDate: Annotated[ApproxDatetime, Doc("When the condition started? Required")]
    status: Annotated[
        Literal["active", "recurrence", "relapse", "inactive", "remission", "resolved", "unknown"],
        Doc("Always ask for current status of the condition"),
    ]
    endDate: NotRequired[Annotated[ApproxDatetime, Doc("If the condition was no longer active")]]


class Medication(TypedDict):
    """
    Meds, pills etc.
    """

    name: Annotated[str, Doc("Fix any spelling mistakes, especially phonetic spelling")]
    dose: Annotated[ApproxQuantity, Doc("E.g. 2 tablets, 1 cup. Required")]
    frequency: Annotated[ApproxQuantity, Doc("E.g. twice a day. Required")]
    strength: Annotated[ApproxQuantity, Doc("E.g. 50 mg. Required")]


class HealthData(TypedDict, total=False):
    medication: list[Medication]
    condition: list[Condition]
    other: list[OtherHealthData]


class HealthDataResponse(TypedDict, total=False):
    data: Annotated[HealthData, Doc("Return this if JSON has ALL required information. Else ask questions")]
    message: Annotated[str, Doc("Use this to ask questions and give pertinent responses")]
    notTranslated: Annotated[str, Doc("Use this parts of the user request not translateed, off topic, etc")]
