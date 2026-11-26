import type { Result } from "./result.js";

/**
 * Represents a section of an LLM prompt with an associated role. By default translators send the
 * schema and output instructions as system, the current request as user, and, when repairing,
 * the rejected model response as assistant and the diagnostic as user.
 */
export interface PromptSection {
    /**
     * Specifies the role of this section.
     */
    role: "system" | "user" | "assistant";
    /**
     * Specifies the content of this section.
     */
    content: PromptContent;
}

export type PromptContent =
    | string
    | MultimodalPromptContent[];

/**
 * GPT-4-vision, GPT-4-omni and GPT-4-turbo allow multi-modal input, where images and text can
 * be part of the prompt. To support this, the content section of the prompt has an array of objects.
 */
export type MultimodalPromptContent =
    | string
    | TextPromptContent
    | ImagePromptContent;

export type TextPromptContent = {
    type: "text";
    text: string;
};

export type ImagePromptContent = {
    type: "image_url";
    image_url: ImageUrl;
};

export type ImageUrl = {
    /*
     * This could be a URL to a hosted image, or the base64-encoded image content.
     */
    url: string;

    /*
     * Controls how the model processes the image and generates its textual understanding.
     * In "low" mode, the model treats the image as 512x512px, while "high" mode considers
     * the image at full size.
     */
    detail?: "auto" | "low" | "high";
};

/**
 * Represents a AI language model that can complete prompts. TypeChat uses an implementation of this
 * interface to communicate with an AI service that can translate natural language requests to JSON
 * instances according to a provided schema. The `createLanguageModel`, `createOpenAILanguageModel`,
 * `createAzureOpenAILanguageModel`, and `createOpenAILanguageModelFromClient` functions create
 * instances of this interface.
 */
export interface TypeChatLanguageModel {
    /**
     * Optional property that specifies the maximum number of retry attempts (the default is 3).
     */
    retryMaxAttempts?: number;
    /**
     * Optional property that specifies the delay before retrying in milliseconds (the default is 1000ms).
     */
    retryPauseMs?: number;
    /**
     * Optional property that specifies the timeout, in milliseconds, applied to each HTTP request
     * made to the model endpoint (the default is 600000ms, i.e. 10 minutes). A request - including
     * reading its response body - is aborted if it does not complete within this time, preventing a
     * slow or unresponsive endpoint from causing `complete` to hang indefinitely and exhaust
     * resources. Set to 0 or a negative value to disable the timeout.
     */
    timeoutMs?: number;
    /**
     * Optional property that specifies the maximum size, in bytes, of a response body accepted from
     * the model endpoint (the default is 104857600, i.e. 100 MB). A larger response is rejected
     * without being fully buffered in memory, preventing a malicious or malfunctioning endpoint from
     * exhausting memory. Set to 0 or a negative value to disable the limit.
     */
    maxResponseBytes?: number;
    /**
     * Obtains a completion from the language model for the given prompt.
     * @param prompt A prompt string or an array of prompt sections. If a string is specified,
     *   it is converted into a single "user" role prompt section.
     *   Preserve the roles and order of sections; report unsupported layouts rather than flattening them.
     * Optional result metadata contains service-reported usage and filtering information.
     */
    complete(prompt: string | PromptSection[]): Promise<Result<string>>;
}
