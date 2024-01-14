export type TaskClassification = {
    name: string;
    description: string;
};

/**
 * Represents the response of a task classification.
 */
export interface TaskClassificationResponse {
    //Describe the kind of task to perform
    taskType: string;
}