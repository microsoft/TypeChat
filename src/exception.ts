// (c) Copyright Microsoft Corp

export enum TypechatErrorCode {
    NotEmbeddingModel
}

export class TypechatException extends Error {
    _errorCode : TypechatErrorCode;
    
    public constructor(errorCode : TypechatErrorCode, message? : string) {
        super(errorCode.toString() + message);
        this._errorCode = errorCode;
    }
    
    get errorCode() {return this._errorCode;}
}
