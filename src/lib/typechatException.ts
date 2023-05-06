import { Exception } from './core';

export enum TypechatErrorCode {
    Unknown = 1,
    ModelNotFound,
    ModelDoesNotSupportCompletion,
    ModelDoesNotSupportEmbeddings,
}

export class TypechatException extends Exception<TypechatErrorCode> {
    constructor(errorCode: TypechatErrorCode, message?: string) {
        super(errorCode, message);
    }
}
