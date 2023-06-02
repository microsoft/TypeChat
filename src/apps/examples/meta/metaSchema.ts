// A person is working with a generative AI model on a broad set of applications

// The possible applications
export const applications = [
    'ordering at a restaurant',
    'ordering at a cafe',
    'making calendar changes',
    'working with a music service',
    'creating a written document',
    'controlling a browser',
];

export type Request = {
    // a string from the applications array; the string represents the application related to the user request
    area: string;
    // the exact text of the user request
    text: string;
};

export type Requests = {
    requests: Request[];
};
