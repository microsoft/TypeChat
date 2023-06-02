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

export type ApplicationAreas = {
    // one or more strings from the applications array; each string represents an application related to the user request
    areas: string[];
    // the complete text of the user request
    description: string;
};
