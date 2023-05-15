import { Exception } from './core';

export enum TypechatErrorCode {
    Unknown = 1,
    ConfigMissingOpenAISettings,
    // Model Errors
    ModelNotFound,
    CompletionModelNotAvailable,
    EmbeddingModelNotAvailable,
    ModelDoesNotSupportCompletion,
    ModelDoesNotSupportEmbeddings,
    // Chat errors
    MissingEmbedding
}

export class TypechatException extends Exception<TypechatErrorCode> {
    constructor(errorCode: TypechatErrorCode, message?: string) {
        super(errorCode, message);
    }
}
