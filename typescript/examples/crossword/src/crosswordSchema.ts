// The following is a schema definition for determining the sentiment of a some user input.

export type GetClueText = {
    actionName: "getClueText";
    parameters: {
        clueNumber: number;
        clueDirection: "across" | "down";
        value: string;
    };
};

// This gives the answer for the requested crossword clue
export type GetAnswerValue = {
    actionName: "getAnswerValue";
    parameters: {
        proposedAnswer: string;
        clueNumber: number;
        clueDirection: "across" | "down";
    };
};

export type UnknownAction = {
    actionName: "unknown";
    parameters: {
        // text typed by the user that the system did not understand
        text: string;
    };
};

export type CrosswordActions =
    | GetClueText
    | GetAnswerValue
    | UnknownAction;