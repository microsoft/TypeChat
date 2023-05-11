import { Exception } from './core';

export enum TypechatErrorCode {
    Unknown = 1,
    ConfigMissingOpenAISettings,
    // Model Errors
    ModelNotFound,
    CompletionModelNotAvailable,
    ModelDoesNotSupportCompletion,
    ModelDoesNotSupportEmbeddings,
}

export class TypechatException extends Exception<TypechatErrorCode> {
    constructor(errorCode: TypechatErrorCode, message?: string) {
        super(errorCode, message);
    }
}
