// (c) Copyright Microsoft Corp

export class TypechatException<TError> extends Error {
    _errorCode : TError;
    _innerEx? : Error;
    
    public constructor(errorCode : TError, message? : string, innerEx? : Error) {
        super(message);
        this._errorCode = errorCode;
        this._innerEx = innerEx;
    }
    
    get errorCode() : TError {return this._errorCode;}
    get innerEx() {return this._innerEx};
}
