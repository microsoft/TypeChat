// The following is a schema definition for ordering lattes.

export interface HealthDataResponse {
    // Return this if JSON has ALL required information. Else ask questions
    data?: HealthData;
    // Use this to ask questions and give pertinent responses
    message?: string;
    // Use this parts of the user request not translateed, off topic, etc
    notTranslated?: string;
}

export interface HealthData {
    medication?: Medication[];
    condition?: Condition[];
    other?: OtherHealthData[];
}

// Meds, pills etc.
export interface Medication {
    // Fix any spelling mistakes, especially phonetic spelling
    name: string;
    // E.g. 2 tablets, 1 cup. Required
    dose: ApproxQuantity;
    // E.g. twice a day. Required
    frequency: ApproxQuantity;
    // E.g. 50 mg. Required
    strength: ApproxQuantity;
}

// Disease, Ailment, Injury, Sickness
export interface Condition {
    // Fix any spelling mistakes, especially phonetic spelling
    name: string;
    // When the condition started? Required
    startDate: ApproxDatetime;
    // Always ask for current status of the condition
    status: "active" | "recurrence" | "relapse" | "inactive" | "remission" | "resolved" | "unknown";
    // If the condition was no longer active
    endDate?: ApproxDatetime;
}

// Use for health data that match nothing else. E.g. immunization, blood prssure etc
export interface OtherHealthData {
    text: string;
    when?: ApproxDatetime;
}

export interface ApproxQuantity {
    // Default: Unknown. Required
    displayText: string;
    // Optional: only if precise quantities are available
    quantity?: Quantity;
}

export interface ApproxDatetime {
    // Default: Unknown. Required
    displayText: string;
    // If precise timestamp can be set
    timestamp?: string;
}

export interface Quantity {
    // Exact number
    value: number;
    // UNITS include mg, kg, cm, pounds, liter, ml, tablet, pill, cup, per-day, per-week..ETC
    units: string;
}