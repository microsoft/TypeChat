// (c) Copyright Microsoft Corp
//
// For speed of experimentation, core  libraries parked here for now. As project evolves, some of these will be replaced by
// standard libraries. Others will get refactored into their own modules.

export class Exception<TError> extends Error {
    private _errorCode: TError;
    private _innerEx?: Error;

    public constructor(errorCode: TError, message?: string, innerEx?: Error) {
        if (message === undefined || message === null) {
            message = '';
        }
        message = `Typescript Error: ${errorCode}. ${message}`;
        super(message);
        this._errorCode = errorCode;
        this._innerEx = innerEx;
    }

    get errorCode(): TError {
        return this._errorCode;
    }
    get innerEx() {
        return this._innerEx;
    }
}

export class ArgumentException extends Error {
    public constructor(message: string, name?: string) {
        if (name) {
            message = name + ':' + message;
        }
        super(message);
    }
}

export class Validator {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static defined(value: any, name?: string): void {
        if (value === undefined || value === null) {
            throw new Error(`${name || 'Value'} must be defined`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static notEmpty(value: string | Array<any>, name?: string): void {
        if (value === null || value === undefined || value.length === 0) {
            throw new Error(`${name || 'Value'} must not be null or empty`);
        }
    }
    public static greaterThan(
        value: number,
        minValue: number,
        name?: string
    ): void {
        if (value < minValue) {
            throw new ArgumentException(
                `${value} is not greater than ${minValue}`,
                name
            );
        }
    }
    public static validate<T>(items: T[], validator: (value: T) => void): void {
        Validator.notEmpty(items);
        for (let i = 0; i < items.length; ++i) {
            validator(items[i]);
        }
    }
}

const strEqIOptions = { sensitivity: 'base' };
export function strEqInsensitive(x: string, y: string): boolean {
    return x.localeCompare(y, undefined, strEqIOptions) === 0;
}
