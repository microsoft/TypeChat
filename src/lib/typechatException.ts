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
    MissingEmbedding,
}

export class TypechatException extends Error {
    readonly errorCode: TypechatErrorCode;
    constructor(errorCode: TypechatErrorCode, message?: string) {
        super(`Typechat error ${errorCode}${message ? `: ${message}` : `.`}`);
        this.errorCode = errorCode;
    }
}
